import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OutboxService } from './outbox.service';
import { OutboxEvent, OutboxStatus } from './outbox.entity';
import { KafkaService } from '../kafka';

describe('OutboxService', () => {
  let service: OutboxService;
  const repository = {
    create: jest.fn((data: Partial<OutboxEvent>) => ({ ...data }) as OutboxEvent),
    save: jest.fn(async (event: OutboxEvent) => event),
    find: jest.fn(),
    update: jest.fn(),
  };
  const kafkaService = { emit: jest.fn() };

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
      createdAt: new Date('2026-10-01T10:00:00Z'),
      updatedAt: new Date('2026-10-01T10:00:00Z'),
      ...overrides,
    }) as OutboxEvent;

  beforeAll(() => Logger.overrideLogger(false));

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxService,
        { provide: getRepositoryToken(OutboxEvent), useValue: repository },
        { provide: KafkaService, useValue: kafkaService },
      ],
    }).compile();

    service = moduleRef.get(OutboxService);
  });

  it('persists new events as PENDING without touching Kafka', async () => {
    const result = await service.createOutboxEvent({
      aggregateId: 'ticket-1',
      aggregateType: 'Ticket',
      eventType: 'ticket.created',
      payload: { title: 'Bug' },
      kafkaTopic: 'ticket.events',
    });

    expect(result.status).toBe(OutboxStatus.PENDING);
    expect(result.kafkaTopic).toBe('ticket.events');
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(kafkaService.emit).not.toHaveBeenCalled();
  });

  it('publishes pending events to their Kafka topic and marks them as SENT', async () => {
    const event = buildEvent();
    repository.find.mockResolvedValue([event]);
    kafkaService.emit.mockResolvedValue(undefined);

    await service.processPendingEvents();

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
    expect(event.status).toBe(OutboxStatus.SENT);
    expect(event.processedAt).toBeInstanceOf(Date);
  });

  it('does nothing when there are no pending events', async () => {
    repository.find.mockResolvedValue([]);

    await service.processPendingEvents();

    expect(kafkaService.emit).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('keeps a failed event PENDING and records the error while retries remain', async () => {
    const event = buildEvent({ retryCount: 1 });
    repository.find.mockResolvedValue([event]);
    kafkaService.emit.mockRejectedValue(new Error('broker down'));

    await service.processPendingEvents();

    expect(event.status).toBe(OutboxStatus.PENDING);
    expect(event.retryCount).toBe(2);
    expect(event.lastError).toBe('broker down');
  });

  it('marks an event as FAILED once it reaches the max retry count', async () => {
    const event = buildEvent({ retryCount: 4 });
    repository.find.mockResolvedValue([event]);
    kafkaService.emit.mockRejectedValue(new Error('broker down'));

    await service.processPendingEvents();

    expect(event.status).toBe(OutboxStatus.FAILED);
    expect(event.retryCount).toBe(5);
  });
});
