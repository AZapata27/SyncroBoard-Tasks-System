import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, IsNull, LessThanOrEqual, Raw, Repository } from 'typeorm';
import { OutboxEvent, OutboxStatus, EventPayload } from './outbox.entity';
import { OUTBOX_OPTIONS, OutboxOptions } from './outbox.options';
import { KafkaService } from '../kafka';

export interface CreateOutboxEventParams {
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  payload: EventPayload;
  kafkaTopic: string;
}

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);
  /** Guards against overlapping runs inside this process (e.g. a slow broker and a short interval). */
  private running = false;

  constructor(
    @InjectRepository(OutboxEvent)
    private readonly outboxRepository: Repository<OutboxEvent>,
    private readonly kafkaService: KafkaService,
    @Inject(OUTBOX_OPTIONS) private readonly options: OutboxOptions,
  ) {}

  /**
   * Creates an outbox event within a transaction
   * This ensures atomicity between business operation and event creation
   */
  async createOutboxEvent(params: CreateOutboxEventParams): Promise<OutboxEvent> {
    const outboxEvent = this.outboxRepository.create({
      aggregateId: params.aggregateId,
      aggregateType: params.aggregateType,
      eventType: params.eventType,
      payload: params.payload,
      kafkaTopic: params.kafkaTopic,
      status: OutboxStatus.PENDING,
    });

    return this.outboxRepository.save(outboxEvent);
  }

  /**
   * Publishes the events that are due to Kafka. Invoked periodically by {@link OutboxScheduler}.
   *
   * Every event is claimed with an atomic conditional UPDATE (PENDING -> PROCESSING) before it is
   * published, so several replicas of the same service can run the relay without publishing the
   * same event twice. Returns the number of events published in this run.
   */
  async processPendingEvents(now: Date = new Date()): Promise<number> {
    if (this.running) {
      this.logger.debug('Previous outbox run still in progress, skipping');
      return 0;
    }

    this.running = true;
    try {
      const candidates = await this.findDueEvents(now);
      if (candidates.length === 0) {
        return 0;
      }

      this.logger.log(`Processing ${candidates.length} pending outbox events`);

      let published = 0;
      for (const event of candidates) {
        if (!(await this.claim(event, now))) {
          // Another replica (or an earlier run) took it in the meantime.
          continue;
        }
        if (await this.publish(event)) {
          published += 1;
        }
      }
      return published;
    } finally {
      this.running = false;
    }
  }

  /**
   * PENDING events whose backoff expired, plus PROCESSING events abandoned for longer than
   * `processingTimeoutMs` (the instance that claimed them died before finishing).
   */
  private findDueEvents(now: Date): Promise<OutboxEvent[]> {
    return this.outboxRepository.find({
      where: [
        { status: OutboxStatus.PENDING, nextAttemptAt: IsNull() },
        { status: OutboxStatus.PENDING, nextAttemptAt: LessThanOrEqual(now) },
        {
          status: OutboxStatus.PROCESSING,
          // updated_at is written by the database, so compare against the database clock.
          updatedAt: Raw(
            (column) => `${column} < LOCALTIMESTAMP - make_interval(secs => :timeoutSec)`,
            {
              timeoutSec: this.options.processingTimeoutMs / 1000,
            },
          ),
        },
      ],
      order: { createdAt: 'ASC' },
      take: this.options.batchSize,
    });
  }

  /**
   * Optimistic status transition: only one caller can move a given row to PROCESSING, because the
   * UPDATE re-checks the state the event was read in (status, due time and retry count).
   */
  private async claim(event: OutboxEvent, now: Date): Promise<boolean> {
    const result = await this.outboxRepository
      .createQueryBuilder()
      .update(OutboxEvent)
      .set({ status: OutboxStatus.PROCESSING })
      .where('id = :id', { id: event.id })
      .andWhere('retry_count = :retryCount', { retryCount: event.retryCount })
      .andWhere(
        new Brackets((qb) => {
          qb.where('status = :pending AND (next_attempt_at IS NULL OR next_attempt_at <= :now)', {
            pending: OutboxStatus.PENDING,
            now,
          }).orWhere(
            'status = :processing AND updated_at < LOCALTIMESTAMP - make_interval(secs => :timeoutSec)',
            {
              processing: OutboxStatus.PROCESSING,
              timeoutSec: this.options.processingTimeoutMs / 1000,
            },
          );
        }),
      )
      .execute();

    if (result.affected !== 1) {
      return false;
    }
    event.status = OutboxStatus.PROCESSING;
    return true;
  }

  private async publish(event: OutboxEvent): Promise<boolean> {
    try {
      await this.kafkaService.emit(event.kafkaTopic, {
        eventId: event.id,
        eventType: event.eventType,
        aggregateId: event.aggregateId,
        aggregateType: event.aggregateType,
        ...event.payload,
        timestamp: event.createdAt,
      });
    } catch (error) {
      await this.registerFailure(event, error);
      return false;
    }

    event.status = OutboxStatus.SENT;
    event.processedAt = new Date();
    event.lastError = null;
    event.nextAttemptAt = null;
    await this.outboxRepository.update(
      { id: event.id },
      {
        status: event.status,
        processedAt: event.processedAt,
        lastError: null,
        nextAttemptAt: null,
      },
    );
    this.logger.debug(`Successfully processed outbox event ${event.id}`);
    return true;
  }

  private async registerFailure(event: OutboxEvent, error: unknown): Promise<void> {
    event.retryCount += 1;
    event.lastError = error instanceof Error ? error.message : String(error);

    if (event.retryCount >= this.options.maxAttempts) {
      event.status = OutboxStatus.FAILED;
      event.nextAttemptAt = null;
      this.logger.error(
        `Outbox event ${event.id} marked as FAILED after ${event.retryCount} attempts: ${event.lastError}`,
      );
    } else {
      event.status = OutboxStatus.PENDING;
      event.nextAttemptAt = new Date(Date.now() + this.backoffDelay(event.retryCount));
      this.logger.warn(
        `Failed to publish outbox event ${event.id} (attempt ${event.retryCount}/${this.options.maxAttempts}), ` +
          `retrying at ${event.nextAttemptAt.toISOString()}: ${event.lastError}`,
      );
    }

    await this.outboxRepository.update(
      { id: event.id },
      {
        status: event.status,
        retryCount: event.retryCount,
        lastError: event.lastError,
        nextAttemptAt: event.nextAttemptAt,
      },
    );
  }

  /** Exponential backoff: base, 2x base, 4x base... capped at retryMaxDelayMs. */
  backoffDelay(failedAttempts: number): number {
    const exponent = Math.max(failedAttempts - 1, 0);
    return Math.min(this.options.retryBaseDelayMs * 2 ** exponent, this.options.retryMaxDelayMs);
  }

  /**
   * Puts every FAILED event back in the queue with a fresh attempt budget (manual recovery).
   */
  async retryFailedEvents(): Promise<void> {
    await this.outboxRepository.update(
      { status: OutboxStatus.FAILED },
      {
        status: OutboxStatus.PENDING,
        retryCount: 0,
        lastError: null,
        nextAttemptAt: null,
      },
    );

    this.logger.log('Reset failed events for retry');
  }

  /**
   * Cleanup old processed events
   */
  async cleanupOldEvents(daysOld = 7): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await this.outboxRepository
      .createQueryBuilder()
      .delete()
      .where('status = :status', { status: OutboxStatus.SENT })
      .andWhere('processed_at < :cutoffDate', { cutoffDate })
      .execute();

    this.logger.log(`Cleaned up ${result.affected} old outbox events`);
  }
}
