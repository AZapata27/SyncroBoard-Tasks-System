import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket } from './ticket.entity';
import { OutboxService } from '@app/common';
import {
  CreateTicketDto,
  UpdateTicketDto,
  TicketFilterDto,
  TicketResponseDto,
  KAFKA_TOPICS,
  EVENT_TYPES,
  TicketCreatedEvent,
  TicketUpdatedEvent,
  TicketStatusChangedEvent,
  TicketDeletedEvent,
} from '@app/contracts';

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
    private readonly outboxService: OutboxService,
  ) {}

  async create(createTicketDto: CreateTicketDto, userId: string): Promise<TicketResponseDto> {
    const ticket = this.ticketRepository.create({
      ...createTicketDto,
      reporterId: userId,
    });

    const savedTicket = await this.ticketRepository.save(ticket);

    // Create outbox event
    const eventPayload: Omit<TicketCreatedEvent, 'eventId' | 'timestamp'> = {
      ticketId: savedTicket.id,
      projectId: savedTicket.projectId,
      title: savedTicket.title,
      description: savedTicket.description,
      type: savedTicket.type,
      priority: savedTicket.priority,
      status: savedTicket.status,
      reporterId: savedTicket.reporterId,
    };

    await this.outboxService.createOutboxEvent({
      aggregateId: savedTicket.id,
      aggregateType: 'Ticket',
      eventType: EVENT_TYPES.TICKET_CREATED,
      payload: eventPayload,
      kafkaTopic: KAFKA_TOPICS.TICKET_EVENTS,
    });

    return this.mapToResponseDto(savedTicket);
  }

  async findAll(filterDto: TicketFilterDto): Promise<{ data: TicketResponseDto[]; total: number }> {
    const query = this.ticketRepository.createQueryBuilder('ticket');

    if (filterDto.projectId) {
      query.andWhere('ticket.project_id = :projectId', { projectId: filterDto.projectId });
    }

    if (filterDto.type) {
      query.andWhere('ticket.type = :type', { type: filterDto.type });
    }

    if (filterDto.priority) {
      query.andWhere('ticket.priority = :priority', { priority: filterDto.priority });
    }

    if (filterDto.status) {
      query.andWhere('ticket.status = :status', { status: filterDto.status });
    }

    if (filterDto.reporterId) {
      query.andWhere('ticket.reporter_id = :reporterId', { reporterId: filterDto.reporterId });
    }

    if (filterDto.sprintId) {
      query.andWhere('ticket.sprint_id = :sprintId', { sprintId: filterDto.sprintId });
    }

    if (filterDto.search) {
      query.andWhere(
        '(ticket.title ILIKE :search OR ticket.description ILIKE :search)',
        { search: `%${filterDto.search}%` }
      );
    }

    const page = filterDto.page || 1;
    const limit = filterDto.limit || 20;
    const skip = (page - 1) * limit;

    query.skip(skip).take(limit);
    query.orderBy('ticket.created_at', 'DESC');

    const [tickets, total] = await query.getManyAndCount();

    return {
      data: tickets.map(ticket => this.mapToResponseDto(ticket)),
      total,
    };
  }

  async findOne(id: string): Promise<TicketResponseDto> {
    const ticket = await this.ticketRepository.findOne({ where: { id } });
    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${id} not found`);
    }
    return this.mapToResponseDto(ticket);
  }

  async update(
    id: string,
    updateTicketDto: UpdateTicketDto,
    userId: string,
  ): Promise<TicketResponseDto> {
    const ticket = await this.ticketRepository.findOne({ where: { id } });
    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${id} not found`);
    }

    const oldStatus = ticket.status;
    Object.assign(ticket, updateTicketDto);
    const updatedTicket = await this.ticketRepository.save(ticket);

    // Create update event
    const eventPayload: Omit<TicketUpdatedEvent, 'eventId' | 'timestamp'> = {
      ticketId: updatedTicket.id,
      projectId: updatedTicket.projectId,
      ...updateTicketDto,
    };

    await this.outboxService.createOutboxEvent({
      aggregateId: updatedTicket.id,
      aggregateType: 'Ticket',
      eventType: EVENT_TYPES.TICKET_UPDATED,
      payload: eventPayload,
      kafkaTopic: KAFKA_TOPICS.TICKET_EVENTS,
    });

    // If status changed, create status changed event
    if (updateTicketDto.status && oldStatus !== updateTicketDto.status) {
      const statusEventPayload: Omit<TicketStatusChangedEvent, 'eventId' | 'timestamp'> = {
        ticketId: updatedTicket.id,
        oldStatus,
        newStatus: updateTicketDto.status,
        changedById: userId,
      };

      await this.outboxService.createOutboxEvent({
        aggregateId: updatedTicket.id,
        aggregateType: 'Ticket',
        eventType: EVENT_TYPES.TICKET_STATUS_CHANGED,
        payload: statusEventPayload,
        kafkaTopic: KAFKA_TOPICS.TICKET_EVENTS,
      });
    }

    return this.mapToResponseDto(updatedTicket);
  }

  async delete(id: string): Promise<void> {
    const ticket = await this.ticketRepository.findOne({ where: { id } });
    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${id} not found`);
    }

    await this.ticketRepository.remove(ticket);

    // Create delete event
    const eventPayload: Omit<TicketDeletedEvent, 'eventId' | 'timestamp'> = {
      ticketId: id,
      projectId: ticket.projectId,
    };

    await this.outboxService.createOutboxEvent({
      aggregateId: id,
      aggregateType: 'Ticket',
      eventType: EVENT_TYPES.TICKET_DELETED,
      payload: eventPayload,
      kafkaTopic: KAFKA_TOPICS.TICKET_EVENTS,
    });
  }

  private mapToResponseDto(ticket: Ticket): TicketResponseDto {
    return {
      id: ticket.id,
      projectId: ticket.projectId,
      title: ticket.title,
      description: ticket.description,
      type: ticket.type,
      priority: ticket.priority,
      status: ticket.status,
      reporterId: ticket.reporterId,
      estimatedHours: ticket.estimatedHours,
      sprintId: ticket.sprintId,
      parentTicketId: ticket.parentTicketId,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    };
  }
}
