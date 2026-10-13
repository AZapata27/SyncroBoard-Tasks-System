import { Logger } from '@nestjs/common';
import { PATTERN_METADATA } from '@nestjs/microservices/constants';
import { Test } from '@nestjs/testing';
import { KAFKA_TOPICS } from '@app/contracts';
import { EventsController } from './events.controller';

describe('EventsController (Kafka consumers)', () => {
  let controller: EventsController;
  let logSpy: jest.SpyInstance;

  const timestamp = new Date('2026-10-01T00:00:00Z');

  beforeEach(async () => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);

    const moduleRef = await Test.createTestingModule({
      controllers: [EventsController],
    }).compile();

    controller = moduleRef.get(EventsController);
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['handleUserEvents', KAFKA_TOPICS.USER_EVENTS],
    ['handleTicketEvents', KAFKA_TOPICS.TICKET_EVENTS],
    ['handleAssignmentEvents', KAFKA_TOPICS.ASSIGNMENT_EVENTS],
    ['handleNotificationEvents', KAFKA_TOPICS.NOTIFICATION_EVENTS],
  ] as const)('%s is subscribed to the %s topic', (handler, topic) => {
    const patterns = Reflect.getMetadata(PATTERN_METADATA, EventsController.prototype[handler]);

    expect(patterns).toEqual([topic]);
  });

  it('subscribes to every topic published by the other services', () => {
    const subscribed = (
      [
        'handleUserEvents',
        'handleTicketEvents',
        'handleAssignmentEvents',
        'handleNotificationEvents',
      ] as const
    ).flatMap((handler) =>
      Reflect.getMetadata(PATTERN_METADATA, EventsController.prototype[handler]),
    );

    expect(subscribed.sort()).toEqual(Object.values(KAFKA_TOPICS).sort());
  });

  it('handles a ticket.assigned event from assignment.events', async () => {
    await expect(
      controller.handleAssignmentEvents({
        eventId: 'evt-1',
        eventType: 'ticket.assigned',
        timestamp,
        assignmentId: 'assignment-1',
        ticketId: 'ticket-1',
        userId: 'user-2',
        assignedById: 'user-1',
      }),
    ).resolves.toBeUndefined();

    expect(logSpy).toHaveBeenCalledWith('Received assignment event: ticket.assigned');
  });

  it('handles a user.registered event from user.events', async () => {
    await controller.handleUserEvents({
      eventId: 'evt-2',
      eventType: 'user.registered',
      timestamp,
      userId: 'user-1',
      email: 'ada@syncroboard.dev',
    });

    expect(logSpy).toHaveBeenCalledWith('Received user event: user.registered');
  });

  it('handles ticket.status.changed events from ticket.events', async () => {
    await controller.handleTicketEvents({
      eventId: 'evt-3',
      eventType: 'ticket.status.changed',
      timestamp,
      ticketId: 'ticket-1',
      status: 'DONE',
    });

    expect(logSpy).toHaveBeenCalledWith('Received ticket event: ticket.status.changed');
  });

  it('handles generic notification events', async () => {
    await controller.handleNotificationEvents({
      eventId: 'evt-4',
      eventType: 'notification.custom',
      timestamp,
    });

    expect(logSpy).toHaveBeenCalledWith('Received notification event: notification.custom');
  });
});
