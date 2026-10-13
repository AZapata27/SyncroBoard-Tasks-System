import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OutboxService } from '@app/common';
import {
  EVENT_TYPES,
  KAFKA_TOPICS,
  TicketPriority,
  TicketStatus,
  TicketType,
} from '@app/contracts';
import { TicketsService } from './tickets.service';
import { Ticket } from './ticket.entity';

const buildTicket = (overrides: Partial<Ticket> = {}): Ticket =>
  ({
    id: 'ticket-1',
    projectId: 'project-1',
    title: 'Login button does nothing',
    description: 'Clicking login has no effect',
    type: TicketType.BUG,
    priority: TicketPriority.HIGH,
    status: TicketStatus.TODO,
    reporterId: 'user-1',
    estimatedHours: null,
    sprintId: null,
    parentTicketId: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    ...overrides,
  }) as Ticket;

describe('TicketsService', () => {
  let service: TicketsService;
  const queryBuilder = {
    andWhere: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
  };
  const repository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
  const outboxService = { createOutboxEvent: jest.fn() };

  const emittedEventTypes = () =>
    outboxService.createOutboxEvent.mock.calls.map(([params]) => params.eventType);

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getRepositoryToken(Ticket), useValue: repository },
        { provide: OutboxService, useValue: outboxService },
      ],
    }).compile();

    service = moduleRef.get(TicketsService);
  });

  describe('create', () => {
    it('sets the reporter from the authenticated user and records ticket.created', async () => {
      const ticket = buildTicket();
      repository.create.mockReturnValue(ticket);
      repository.save.mockResolvedValue(ticket);

      const result = await service.create(
        {
          projectId: 'project-1',
          title: ticket.title,
          description: ticket.description,
          type: TicketType.BUG,
          priority: TicketPriority.HIGH,
        },
        'user-1',
      );

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ reporterId: 'user-1', projectId: 'project-1' }),
      );
      expect(outboxService.createOutboxEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          aggregateId: 'ticket-1',
          eventType: EVENT_TYPES.TICKET_CREATED,
          kafkaTopic: KAFKA_TOPICS.TICKET_EVENTS,
          payload: expect.objectContaining({ ticketId: 'ticket-1', status: TicketStatus.TODO }),
        }),
      );
      expect(result).toMatchObject({ id: 'ticket-1', reporterId: 'user-1' });
    });
  });

  describe('findOne', () => {
    it('returns the mapped ticket', async () => {
      repository.findOne.mockResolvedValue(buildTicket());

      await expect(service.findOne('ticket-1')).resolves.toMatchObject({
        id: 'ticket-1',
        title: 'Login button does nothing',
      });
    });

    it('throws NotFoundException for unknown tickets', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update / status transitions', () => {
    it('records ticket.updated and ticket.status.changed when the status moves', async () => {
      const ticket = buildTicket({ status: TicketStatus.TODO });
      repository.findOne.mockResolvedValue(ticket);
      repository.save.mockImplementation(async (t: Ticket) => t);

      const result = await service.update(
        'ticket-1',
        { status: TicketStatus.IN_PROGRESS },
        'user-2',
      );

      expect(result.status).toBe(TicketStatus.IN_PROGRESS);
      expect(emittedEventTypes()).toEqual([
        EVENT_TYPES.TICKET_UPDATED,
        EVENT_TYPES.TICKET_STATUS_CHANGED,
      ]);
      expect(outboxService.createOutboxEvent).toHaveBeenLastCalledWith(
        expect.objectContaining({
          payload: {
            ticketId: 'ticket-1',
            oldStatus: TicketStatus.TODO,
            newStatus: TicketStatus.IN_PROGRESS,
            changedById: 'user-2',
          },
        }),
      );
    });

    it('does not record a status change when the status is unchanged', async () => {
      repository.findOne.mockResolvedValue(buildTicket({ status: TicketStatus.IN_REVIEW }));
      repository.save.mockImplementation(async (t: Ticket) => t);

      await service.update('ticket-1', { status: TicketStatus.IN_REVIEW }, 'user-2');

      expect(emittedEventTypes()).toEqual([EVENT_TYPES.TICKET_UPDATED]);
    });

    it('does not record a status change for non-status updates', async () => {
      repository.findOne.mockResolvedValue(buildTicket());
      repository.save.mockImplementation(async (t: Ticket) => t);

      const result = await service.update('ticket-1', { title: 'New title' }, 'user-2');

      expect(result.title).toBe('New title');
      expect(emittedEventTypes()).toEqual([EVENT_TYPES.TICKET_UPDATED]);
    });

    it('throws NotFoundException and emits nothing for unknown tickets', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(
        service.update('missing', { status: TicketStatus.DONE }, 'user-2'),
      ).rejects.toThrow(NotFoundException);
      expect(repository.save).not.toHaveBeenCalled();
      expect(outboxService.createOutboxEvent).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('removes the ticket and records ticket.deleted', async () => {
      const ticket = buildTicket();
      repository.findOne.mockResolvedValue(ticket);

      await service.delete('ticket-1');

      expect(repository.remove).toHaveBeenCalledWith(ticket);
      expect(outboxService.createOutboxEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: EVENT_TYPES.TICKET_DELETED,
          payload: { ticketId: 'ticket-1', projectId: 'project-1' },
        }),
      );
    });

    it('throws NotFoundException for unknown tickets', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.delete('missing')).rejects.toThrow(NotFoundException);
      expect(repository.remove).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('applies filters and pagination', async () => {
      queryBuilder.getManyAndCount.mockResolvedValue([[buildTicket()], 41]);

      const result = await service.findAll({
        projectId: 'project-1',
        status: TicketStatus.TODO,
        search: 'login',
        page: 3,
        limit: 10,
      });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith('ticket.project_id = :projectId', {
        projectId: 'project-1',
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('ticket.status = :status', {
        status: TicketStatus.TODO,
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        '(ticket.title ILIKE :search OR ticket.description ILIKE :search)',
        { search: '%login%' },
      );
      expect(queryBuilder.skip).toHaveBeenCalledWith(20);
      expect(queryBuilder.take).toHaveBeenCalledWith(10);
      expect(result.total).toBe(41);
      expect(result.data).toHaveLength(1);
    });

    it('defaults to the first page of 20 items', async () => {
      queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({});

      expect(queryBuilder.andWhere).not.toHaveBeenCalled();
      expect(queryBuilder.skip).toHaveBeenCalledWith(0);
      expect(queryBuilder.take).toHaveBeenCalledWith(20);
    });
  });
});
