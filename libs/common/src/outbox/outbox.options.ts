export const OUTBOX_OPTIONS = Symbol('OUTBOX_OPTIONS');

export interface OutboxOptions {
  /** Starts the background relay that publishes pending events (OUTBOX_ENABLED, default true). */
  enabled: boolean;
  /** Time between relay runs in ms (OUTBOX_POLL_INTERVAL_MS, default 5000). */
  pollIntervalMs: number;
  /** Maximum events read per run (OUTBOX_BATCH_SIZE, default 100). */
  batchSize: number;
  /** Failed publish attempts before an event is marked FAILED (OUTBOX_MAX_ATTEMPTS, default 5). */
  maxAttempts: number;
  /** Base delay of the exponential backoff between attempts in ms (OUTBOX_RETRY_BASE_DELAY_MS, default 1000). */
  retryBaseDelayMs: number;
  /** Upper bound of the backoff delay in ms (OUTBOX_RETRY_MAX_DELAY_MS, default 60000). */
  retryMaxDelayMs: number;
  /**
   * An event left in PROCESSING for longer than this (e.g. the instance crashed mid-publish)
   * can be claimed again (OUTBOX_PROCESSING_TIMEOUT_MS, default 60000).
   */
  processingTimeoutMs: number;
}

export const DEFAULT_OUTBOX_OPTIONS: OutboxOptions = {
  enabled: true,
  pollIntervalMs: 5000,
  batchSize: 100,
  maxAttempts: 5,
  retryBaseDelayMs: 1000,
  retryMaxDelayMs: 60000,
  processingTimeoutMs: 60000,
};

const positiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const outboxOptionsFromEnv = (env: NodeJS.ProcessEnv = process.env): OutboxOptions => ({
  enabled: (env['OUTBOX_ENABLED'] ?? 'true').toLowerCase() !== 'false',
  pollIntervalMs: positiveInt(
    env['OUTBOX_POLL_INTERVAL_MS'],
    DEFAULT_OUTBOX_OPTIONS.pollIntervalMs,
  ),
  batchSize: positiveInt(env['OUTBOX_BATCH_SIZE'], DEFAULT_OUTBOX_OPTIONS.batchSize),
  maxAttempts: positiveInt(env['OUTBOX_MAX_ATTEMPTS'], DEFAULT_OUTBOX_OPTIONS.maxAttempts),
  retryBaseDelayMs: positiveInt(
    env['OUTBOX_RETRY_BASE_DELAY_MS'],
    DEFAULT_OUTBOX_OPTIONS.retryBaseDelayMs,
  ),
  retryMaxDelayMs: positiveInt(
    env['OUTBOX_RETRY_MAX_DELAY_MS'],
    DEFAULT_OUTBOX_OPTIONS.retryMaxDelayMs,
  ),
  processingTimeoutMs: positiveInt(
    env['OUTBOX_PROCESSING_TIMEOUT_MS'],
    DEFAULT_OUTBOX_OPTIONS.processingTimeoutMs,
  ),
});
