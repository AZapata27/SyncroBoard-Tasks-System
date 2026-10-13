import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { OUTBOX_OPTIONS, OutboxOptions } from './outbox.options';
import { OutboxService } from './outbox.service';

/**
 * Background relay of the transactional outbox: every `pollIntervalMs` it asks
 * {@link OutboxService} to publish the events that are due. Started once the application has
 * bootstrapped (Kafka client connected) and stopped on shutdown.
 */
@Injectable()
export class OutboxScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxScheduler.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly outboxService: OutboxService,
    @Inject(OUTBOX_OPTIONS) private readonly options: OutboxOptions,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.options.enabled) {
      this.logger.warn('Outbox relay disabled (OUTBOX_ENABLED=false): events stay in the outbox table');
      return;
    }
    this.timer = setInterval(() => void this.tick(), this.options.pollIntervalMs);
    this.logger.log(`Outbox relay started (every ${this.options.pollIntervalMs} ms)`);
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<void> {
    try {
      await this.outboxService.processPendingEvents();
    } catch (error) {
      // A failed run (e.g. database unavailable) must not kill the timer; the next tick retries.
      this.logger.error('Outbox relay run failed', error instanceof Error ? error.stack : error);
    }
  }
}
