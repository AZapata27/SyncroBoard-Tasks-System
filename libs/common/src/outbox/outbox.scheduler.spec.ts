import { Logger } from '@nestjs/common';
import { OutboxScheduler } from './outbox.scheduler';
import { DEFAULT_OUTBOX_OPTIONS, OutboxOptions, outboxOptionsFromEnv } from './outbox.options';
import { OutboxService } from './outbox.service';

describe('OutboxScheduler', () => {
  const outboxService = { processPendingEvents: jest.fn() };
  const createScheduler = (overrides: Partial<OutboxOptions> = {}) =>
    new OutboxScheduler(outboxService as unknown as OutboxService, {
      ...DEFAULT_OUTBOX_OPTIONS,
      pollIntervalMs: 1000,
      ...overrides,
    });

  beforeAll(() => Logger.overrideLogger(false));

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    outboxService.processPendingEvents.mockResolvedValue(0);
  });

  afterEach(() => jest.useRealTimers());

  it('runs the relay every pollIntervalMs once the application has bootstrapped', async () => {
    const scheduler = createScheduler();

    scheduler.onApplicationBootstrap();
    expect(outboxService.processPendingEvents).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(3000);
    expect(outboxService.processPendingEvents).toHaveBeenCalledTimes(3);

    scheduler.onApplicationShutdown();
    await jest.advanceTimersByTimeAsync(3000);
    expect(outboxService.processPendingEvents).toHaveBeenCalledTimes(3);
  });

  it('keeps polling after a failed run', async () => {
    outboxService.processPendingEvents.mockRejectedValueOnce(new Error('database unavailable'));
    const scheduler = createScheduler();

    scheduler.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(2000);

    expect(outboxService.processPendingEvents).toHaveBeenCalledTimes(2);
    scheduler.onApplicationShutdown();
  });

  it('does not start when the relay is disabled', async () => {
    const scheduler = createScheduler({ enabled: false });

    scheduler.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(5000);

    expect(outboxService.processPendingEvents).not.toHaveBeenCalled();
  });
});

describe('outboxOptionsFromEnv', () => {
  it('uses the defaults when nothing is configured', () => {
    expect(outboxOptionsFromEnv({})).toEqual(DEFAULT_OUTBOX_OPTIONS);
  });

  it('reads the relay settings from the environment and ignores invalid values', () => {
    expect(
      outboxOptionsFromEnv({
        OUTBOX_ENABLED: 'false',
        OUTBOX_POLL_INTERVAL_MS: '250',
        OUTBOX_BATCH_SIZE: '10',
        OUTBOX_MAX_ATTEMPTS: '3',
        OUTBOX_RETRY_BASE_DELAY_MS: 'abc',
        OUTBOX_RETRY_MAX_DELAY_MS: '-1',
        OUTBOX_PROCESSING_TIMEOUT_MS: '30000',
      }),
    ).toEqual({
      enabled: false,
      pollIntervalMs: 250,
      batchSize: 10,
      maxAttempts: 3,
      retryBaseDelayMs: DEFAULT_OUTBOX_OPTIONS.retryBaseDelayMs,
      retryMaxDelayMs: DEFAULT_OUTBOX_OPTIONS.retryMaxDelayMs,
      processingTimeoutMs: 30000,
    });
  });
});
