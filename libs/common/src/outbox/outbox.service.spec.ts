import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OutboxService } from './outbox.service';
import { OutboxEvent, OutboxStatus } from './outbox.entity';
import { DEFAULT_OUTBOX_OPTIONS, OUTBOX_OPTIONS, OutboxOptions } from './outbox.options';
import { KafkaService } from '../kafka';

/**
 * In-memory stand-in for the outbox table. The claim UPDATE built by the service is emulated with
 * the same rule the SQL applies: only a row that is still claimable can move to PROCESSING, and
 * only once.
 */
interface QueryBuilderMock {
  update: jest.Mock;
  set: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  execute: jest.Mock;
}

const createOutboxTable = () => {
  const rows = new Map<string, OutboxEvent>();

  const createQueryBuilder = jest.fn(() => {
    let id: string | undefined;
    let retryCount: number | undefined;
    const qb: QueryBuilderMock = {
      update: jest.fn(() => qb),
      set: jest.fn(() => qb),
      where: jest.fn((_sql: string, params?: { id?: string }) => {
        id = params?.id;
        return qb;
      }),
      andWhere: jest.fn((_sql: unknown, params?: { retryCount?: number }) => {
        if (params?.retryCount !== undefined) {
          retryCount = params.retryCount;
        }
        return qb;
      }),
      execute: jest.fn(async () => {
        const row = id ? rows.get(id) : undefined;
        if (!row || row.status !== OutboxStatus.PENDING || row.retryCount !== retryCount) {
          return { affected: 0 };
        }
        row.status = OutboxStatus.PROCESSING;
        return { affected: 1 };
      }),
    };
    return qb;
  });

  const repository = {
    create: jest.fn((data: Partial<OutboxEvent>) => ({ ...data }) as OutboxEvent),
    save: jest.fn(async (event: OutboxEvent) => event),
    // Each caller gets its own copy, as two processes reading the same row would.
    find: jest.fn(async () =>
      [...rows.values()]
        .filter((row) => row.status === OutboxStatus.PENDING)
        .map((row) => ({ ...row }) as OutboxEvent),
    ),
    update: jest.fn(async (criteria: { id?: string }, partial: Partial<OutboxEvent>) => {
      const row = criteria.id ? rows.get(criteria.id) : undefined;
      if (row) {
        Object.assign(row, partial);
      }
      return { affected: row ? 1 : 0 };
    }),
    createQueryBuilder,
  };

  return { rows, repository };
};

const buildEvent = (overrides: Partial<OutboxEvent> = {}): OutboxEvent =>
  ({
    id: 'evt-1',
    aggregateId: 'assignment-1',
    aggregateType: 'Assignment',
    eventType: 'ticket.assigned',
    payload: { ticketId: 'ticket-1', userId: 'user-1' },
    kafkaTopic: 'assignment.events',
    status: OutboxStatus.PENDING,
    retryCount: 0,
    lastError: null,
    processedAt: null,
    nextAttemptAt: null,
    createdAt: new Date('2026-10-01T10:00:00Z'),
    updatedAt: new Date('2026-10-01T10:00:00Z'),
    ...overrides,
  }) as OutboxEvent;

describe('OutboxService', () => {
  const options: OutboxOptions = {
    ...DEFAULT_OUTBOX_OPTIONS,
    maxAttempts: 5,
    retryBaseDelayMs: 1000,
    retryMaxDelayMs: 8000,
    batchSize: 50,
  };
  const now = new Date('2026-10-13T12:00:00Z');

  let table: ReturnType<typeof createOutboxTable>;
  let kafkaService: { emit: jest.Mock };

  const createService = async (): Promise<OutboxService> => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxService,
        { provide: getRepositoryToken(OutboxEvent), useValue: table.repository },
        { provide: KafkaService, useValue: kafkaService },
        { provide: OUTBOX_OPTIONS, useValue: options },
      ],
    }).compile();
    return moduleRef.get(OutboxService);
  };

  beforeAll(() => Logger.overrideLogger(false));

  beforeEach(() => {
    jest.useFakeTimers({ now, doNotFake: ['nextTick', 'setImmediate'] });
    table = createOutboxTable();
    kafkaService = { emit: jest.fn() };
  });

  afterEach(() => jest.useRealTimers());

  it('persists new events as PENDING without touching Kafka', async () => {
    const service = await createService();

    const result = await service.createOutboxEvent({
      aggregateId: 'ticket-1',
      aggregateType: 'Ticket',
      eventType: 'ticket.created',
      payload: { title: 'Bug' },
      kafkaTopic: 'ticket.events',
    });

    expect(result.status).toBe(OutboxStatus.PENDING);
    expect(result.kafkaTopic).toBe('ticket.events');
    expect(table.repository.save).toHaveBeenCalledTimes(1);
    expect(kafkaService.emit).not.toHaveBeenCalled();
  });

  it('publishes due events to their Kafka topic and marks them as SENT', async () => {
    table.rows.set('evt-1', buildEvent());
    kafkaService.emit.mockResolvedValue(undefined);
    const service = await createService();

    const published = await service.processPendingEvents(now);

    expect(published).toBe(1);
    expect(kafkaService.emit).toHaveBeenCalledWith(
      'assignment.events',
      expect.objectContaining({
        eventId: 'evt-1',
        eventType: 'ticket.assigned',
        aggregateId: 'assignment-1',
        ticketId: 'ticket-1',
        userId: 'user-1',
      }),
    );
    const stored = table.rows.get('evt-1');
    expect(stored?.status).toBe(OutboxStatus.SENT);
    expect(stored?.processedAt).toBeInstanceOf(Date);
  });

  it('only reads due events: pending without backoff, pending past its backoff, or stale PROCESSING', async () => {
    const service = await createService();

    await service.processPendingEvents(now);

    const [query] = table.repository.find.mock.calls[0] as unknown as [
      { where: Array<Record<string, unknown>>; take: number; order: unknown },
    ];
    expect(query.take).toBe(50);
    expect(query.order).toEqual({ createdAt: 'ASC' });
    expect(query.where).toHaveLength(3);
    expect(query.where.map((branch) => branch['status'])).toEqual([
      OutboxStatus.PENDING,
      OutboxStatus.PENDING,
      OutboxStatus.PROCESSING,
    ]);
  });

  it('does nothing when there are no due events', async () => {
    const service = await createService();

    const published = await service.processPendingEvents(now);

    expect(published).toBe(0);
    expect(kafkaService.emit).not.toHaveBeenCalled();
    expect(table.repository.update).not.toHaveBeenCalled();
  });

  it('keeps a failed event PENDING with an exponential backoff while attempts remain', async () => {
    table.rows.set('evt-1', buildEvent({ retryCount: 1 }));
    kafkaService.emit.mockRejectedValue(new Error('broker down'));
    const service = await createService();

    const published = await service.processPendingEvents(now);

    expect(published).toBe(0);
    const stored = table.rows.get('evt-1');
    expect(stored?.status).toBe(OutboxStatus.PENDING);
    expect(stored?.retryCount).toBe(2);
    expect(stored?.lastError).toBe('broker down');
    // 2nd failed attempt -> base * 2
    expect(stored?.nextAttemptAt).toEqual(new Date(now.getTime() + 2000));
  });

  it('retries the event on a later run once its backoff has expired', async () => {
    table.rows.set('evt-1', buildEvent());
    kafkaService.emit.mockRejectedValueOnce(new Error('broker down')).mockResolvedValue(undefined);
    const service = await createService();

    await service.processPendingEvents(now);
    expect(table.rows.get('evt-1')?.status).toBe(OutboxStatus.PENDING);

    const later = new Date(now.getTime() + 1000);
    const published = await service.processPendingEvents(later);

    expect(published).toBe(1);
    expect(kafkaService.emit).toHaveBeenCalledTimes(2);
    expect(table.rows.get('evt-1')).toMatchObject({
      status: OutboxStatus.SENT,
      retryCount: 1,
      lastError: null,
      nextAttemptAt: null,
    });
  });

  it('marks an event as FAILED once it reaches the max number of attempts', async () => {
    table.rows.set('evt-1', buildEvent({ retryCount: 4 }));
    kafkaService.emit.mockRejectedValue(new Error('broker down'));
    const service = await createService();

    await service.processPendingEvents(now);

    const stored = table.rows.get('evt-1');
    expect(stored?.status).toBe(OutboxStatus.FAILED);
    expect(stored?.retryCount).toBe(5);
    expect(stored?.nextAttemptAt).toBeNull();
  });

  it('skips an event that another process already claimed', async () => {
    table.rows.set('evt-1', buildEvent());
    const service = await createService();
    // Read as PENDING, but claimed by someone else before our UPDATE runs.
    table.repository.find.mockImplementationOnce(async () => {
      const stored = table.rows.get('evt-1') as OutboxEvent;
      const copy = { ...stored } as OutboxEvent;
      stored.status = OutboxStatus.PROCESSING;
      return [copy];
    });

    const published = await service.processPendingEvents(now);

    expect(published).toBe(0);
    expect(kafkaService.emit).not.toHaveBeenCalled();
  });

  it('publishes each event once when two replicas run the relay at the same time', async () => {
    table.rows.set('evt-1', buildEvent({ id: 'evt-1' }));
    table.rows.set('evt-2', buildEvent({ id: 'evt-2' }));
    kafkaService.emit.mockResolvedValue(undefined);
    const replicaA = await createService();
    const replicaB = await createService();

    const [publishedA, publishedB] = await Promise.all([
      replicaA.processPendingEvents(now),
      replicaB.processPendingEvents(now),
    ]);

    expect(publishedA + publishedB).toBe(2);
    expect(kafkaService.emit).toHaveBeenCalledTimes(2);
    const emittedIds = kafkaService.emit.mock.calls.map(
      ([, message]) => (message as { eventId: string }).eventId,
    );
    expect(emittedIds.sort()).toEqual(['evt-1', 'evt-2']);
  });

  it('does not start a second run while the previous one is still publishing', async () => {
    table.rows.set('evt-1', buildEvent());
    let releaseBroker: () => void = () => undefined;
    kafkaService.emit.mockImplementation(
      () => new Promise<void>((resolve) => (releaseBroker = resolve)),
    );
    const service = await createService();

    const firstRun = service.processPendingEvents(now);
    await new Promise((resolve) => setImmediate(resolve));
    const overlappingRun = await service.processPendingEvents(now);
    releaseBroker();

    expect(overlappingRun).toBe(0);
    expect(await firstRun).toBe(1);
    expect(table.repository.find).toHaveBeenCalledTimes(1);
    expect(kafkaService.emit).toHaveBeenCalledTimes(1);
  });

  it('caps the exponential backoff at retryMaxDelayMs', async () => {
    const service = await createService();

    expect([1, 2, 3, 4, 5, 6].map((attempts) => service.backoffDelay(attempts))).toEqual([
      1000, 2000, 4000, 8000, 8000, 8000,
    ]);
  });

  it('puts FAILED events back in the queue with a fresh attempt budget', async () => {
    const service = await createService();

    await service.retryFailedEvents();

    expect(table.repository.update).toHaveBeenCalledWith(
      { status: OutboxStatus.FAILED },
      { status: OutboxStatus.PENDING, retryCount: 0, lastError: null, nextAttemptAt: null },
    );
  });
});
