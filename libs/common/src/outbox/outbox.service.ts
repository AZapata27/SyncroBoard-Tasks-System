import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutboxEvent, OutboxStatus, EventPayload } from './outbox.entity';
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
  private readonly MAX_RETRIES = 5;

  constructor(
    @InjectRepository(OutboxEvent)
    private readonly outboxRepository: Repository<OutboxEvent>,
    private readonly kafkaService: KafkaService,
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
   * Processes pending outbox events and publishes them to Kafka
   * Should be called periodically by a scheduled job
   */
  async processPendingEvents(): Promise<void> {
    const pendingEvents = await this.outboxRepository.find({
      where: { status: OutboxStatus.PENDING },
      order: { createdAt: 'ASC' },
      take: 100,
    });

    if (pendingEvents.length === 0) {
      return;
    }

    this.logger.log(`Processing ${pendingEvents.length} pending outbox events`);

    for (const event of pendingEvents) {
      await this.processEvent(event);
    }
  }

  private async processEvent(event: OutboxEvent): Promise<void> {
    try {
      // Mark as processing
      event.status = OutboxStatus.PROCESSING;
      await this.outboxRepository.save(event);

      // Publish to Kafka
      await this.kafkaService.emit(event.kafkaTopic, {
        eventId: event.id,
        eventType: event.eventType,
        aggregateId: event.aggregateId,
        aggregateType: event.aggregateType,
        ...event.payload,
        timestamp: event.createdAt,
      });

      // Mark as sent
      event.status = OutboxStatus.SENT;
      event.processedAt = new Date();
      await this.outboxRepository.save(event);

      this.logger.debug(`Successfully processed outbox event ${event.id}`);
    } catch (error) {
      this.logger.error(`Failed to process outbox event ${event.id}`, error);

      event.retryCount += 1;
      event.lastError = error instanceof Error ? error.message : String(error);

      if (event.retryCount >= this.MAX_RETRIES) {
        event.status = OutboxStatus.FAILED;
        this.logger.error(`Outbox event ${event.id} marked as FAILED after ${this.MAX_RETRIES} retries`);
      } else {
        event.status = OutboxStatus.PENDING;
      }

      await this.outboxRepository.save(event);
    }
  }

  /**
   * Retries failed events that haven't exceeded max retry count
   */
  async retryFailedEvents(): Promise<void> {
    await this.outboxRepository.update(
      {
        status: OutboxStatus.FAILED,
        retryCount: this.MAX_RETRIES,
      },
      {
        status: OutboxStatus.PENDING,
        retryCount: 0,
        lastError: null,
      },
    );

    this.logger.log('Reset failed events for retry');
  }

  /**
   * Cleanup old processed events
   */
  async cleanupOldEvents(daysOld: number = 7): Promise<void> {
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
