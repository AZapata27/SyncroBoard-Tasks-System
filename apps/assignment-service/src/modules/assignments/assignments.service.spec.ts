import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { KafkaService, OutboxEvent, OutboxService, OutboxStatus } from '@app/common';
import { EVENT_TYPES, KAFKA_TOPICS } from '@app/contracts';
import { AssignmentsService } from './assignments.service';
import { Assignment } from './assignment.entity';

const buildAssignment = (overrides: Partial<Assignment> = {}): Assignment =>
  ({
    id: 'assignment-1',
    ticketId: 'ticket-1',
    userId: 'user-2',
    assignedById: 'user-1',
    assignedAt: new Date('2026-10-01T00:00:00Z'),
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    ...overrides,
  }) as Assignment;

describe('AssignmentsService', () => {
  let service: AssignmentsService;
  let outboxService: OutboxService;

  const queryBuilder = {
    andWhere: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
  };
  const assignmentRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((data: Partial<Assignment>) => ({ ...data }) as Assignment),
    save: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(() => queryBuilder),
  };

  // In-memory outbox table: the real OutboxService runs on top of it, so the
  // tests cover the whole path "assignment -> outbox row -> Kafka emit".
  let outboxTable: OutboxEvent[];
  const outboxRepository = {
    create: jest.fn((data: Partial<OutboxEvent>) => ({ ...data }) as OutboxEvent),
    save: jest.fn(async (event: OutboxEvent) => {
      if (!event.id) {
        Object.assign(event, {
          id: `evt-${outboxTable.length + 1}`,
          retryCount: 0,
          createdAt: new Date('2026-10-01T00:00:00Z'),
        });
        outboxTable.push(event);
      }
      return event;
    }),
    find: jest.fn(async () => outboxTable.filter((e) => e.status === OutboxStatus.PENDING)),
  };
  const kafkaService = { emit: jest.fn().mockResolvedValue(undefined) };

  beforeAll(() => Logger.overrideLogger(false));

  beforeEach(async () => {
    jest.clearAllMocks();
    outboxTable = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        AssignmentsService,
        OutboxService,
        { provide: getRepositoryToken(Assignment), useValue: assignmentRepository },
        { provide: getRepositoryToken(OutboxEvent), useValue: outboxRepository },
        { provide: KafkaService, useValue: kafkaService },
      ],
    }).compile();

    service = moduleRef.get(AssignmentsService);
    outboxService = moduleRef.get(OutboxService);
  });

  describe('assign', () => {
    it('stores the assignment and records a PENDING ticket.assigned event', async () => {
      assignmentRepository.findOne.mockResolvedValue(null);
      assignmentRepository.save.mockResolvedValue(buildAssignment());

      const result = await service.assign({ ticketId: 'ticket-1', userId: 'user-2' }, 'user-1');

      expect(result).toEqual({
        id: 'assignment-1',
        ticketId: 'ticket-1',
        userId: 'user-2',
        assignedById: 'user-1',
        assignedAt: new Date('2026-10-01T00:00:00Z'),
      });
      expect(outboxTable).toHaveLength(1);
      expect(outboxTable[0]).toMatchObject({
        aggregateId: 'assignment-1',
        aggregateType: 'Assignment',
        eventType: EVENT_TYPES.TICKET_ASSIGNED,
        kafkaTopic: KAFKA_TOPICS.ASSIGNMENT_EVENTS,
        status: OutboxStatus.PENDING,
      });
      // Publishing to Kafka is deferred to the outbox relay.
      expect(kafkaService.emit).not.toHaveBeenCalled();
    });

    it('publishes the ticket.assigned event to the assignment.events Kafka topic', async () => {
      assignmentRepository.findOne.mockResolvedValue(null);
      assignmentRepository.save.mockResolvedValue(buildAssignment());

      await service.assign({ ticketId: 'ticket-1', userId: 'user-2' }, 'user-1');
      await outboxService.processPendingEvents();

      expect(kafkaService.emit).toHaveBeenCalledTimes(1);
      expect(kafkaService.emit).toHaveBeenCalledWith(
        'assignment.events',
        expect.objectContaining({
          eventId: 'evt-1',
          eventType: 'ticket.assigned',
          assignmentId: 'assignment-1',
          ticketId: 'ticket-1',
          userId: 'user-2',
          assignedById: 'user-1',
        }),
      );
      expect(outboxTable[0].status).toBe(OutboxStatus.SENT);
    });

    it('rejects assigning the same user twice to a ticket', async () => {
      assignmentRepository.findOne.mockResolvedValue(buildAssignment());

      await expect(
        service.assign({ ticketId: 'ticket-1', userId: 'user-2' }, 'user-1'),
      ).rejects.toThrow(ConflictException);
      expect(assignmentRepository.save).not.toHaveBeenCalled();
      expect(outboxTable).toHaveLength(0);
    });
  });

  describe('unassign', () => {
    it('removes the assignment and publishes ticket.unassigned', async () => {
      const assignment = buildAssignment();
      assignmentRepository.findOne.mockResolvedValue(assignment);

      await service.unassign({ ticketId: 'ticket-1', userId: 'user-2' }, 'user-3');
      await outboxService.processPendingEvents();

      expect(assignmentRepository.remove).toHaveBeenCalledWith(assignment);
      expect(kafkaService.emit).toHaveBeenCalledWith(
        'assignment.events',
        expect.objectContaining({
          eventType: EVENT_TYPES.TICKET_UNASSIGNED,
          assignmentId: 'assignment-1',
          unassignedById: 'user-3',
        }),
      );
    });

    it('throws NotFoundException when the user is not assigned', async () => {
      assignmentRepository.findOne.mockResolvedValue(null);

      await expect(
        service.unassign({ ticketId: 'ticket-1', userId: 'user-2' }, 'user-3'),
      ).rejects.toThrow(NotFoundException);
      expect(assignmentRepository.remove).not.toHaveBeenCalled();
      expect(outboxTable).toHaveLength(0);
    });
  });

  describe('queries', () => {
    it('filters and paginates assignments', async () => {
      queryBuilder.getManyAndCount.mockResolvedValue([[buildAssignment()], 1]);

      const result = await service.findAll({ userId: 'user-2', page: 2, limit: 5 });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith('assignment.user_id = :userId', {
        userId: 'user-2',
      });
      expect(queryBuilder.skip).toHaveBeenCalledWith(5);
      expect(queryBuilder.take).toHaveBeenCalledWith(5);
      expect(result.total).toBe(1);
    });

    it('lists the assignments of a ticket, newest first', async () => {
      assignmentRepository.find.mockResolvedValue([buildAssignment()]);

      const result = await service.findByTicket('ticket-1');

      expect(assignmentRepository.find).toHaveBeenCalledWith({
        where: { ticketId: 'ticket-1' },
        order: { assignedAt: 'DESC' },
      });
      expect(result).toHaveLength(1);
    });
  });
});
