import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Assignment } from './assignment.entity';
import { OutboxService } from '@app/common';
import {
  AssignTicketDto,
  UnassignTicketDto,
  AssignmentResponseDto,
  GetAssignmentsDto,
  KAFKA_TOPICS,
  EVENT_TYPES,
  TicketAssignedEvent,
  TicketUnassignedEvent,
  AssignmentUpdatedEvent,
} from '@app/contracts';

@Injectable()
export class AssignmentsService {
  constructor(
    @InjectRepository(Assignment)
    private readonly assignmentRepository: Repository<Assignment>,
    private readonly outboxService: OutboxService,
  ) {}

  async assign(
    assignTicketDto: AssignTicketDto,
    assignedById: string,
  ): Promise<AssignmentResponseDto> {
    // Check if already assigned
    const existingAssignment = await this.assignmentRepository.findOne({
      where: {
        ticketId: assignTicketDto.ticketId,
        userId: assignTicketDto.userId,
      },
    });

    if (existingAssignment) {
      throw new ConflictException(
        `User ${assignTicketDto.userId} is already assigned to ticket ${assignTicketDto.ticketId}`,
      );
    }

    const assignment = this.assignmentRepository.create({
      ticketId: assignTicketDto.ticketId,
      userId: assignTicketDto.userId,
      assignedById,
    });

    const savedAssignment = await this.assignmentRepository.save(assignment);

    // Create outbox event
    const eventPayload: Omit<TicketAssignedEvent, 'eventId' | 'timestamp'> = {
      assignmentId: savedAssignment.id,
      ticketId: savedAssignment.ticketId,
      userId: savedAssignment.userId,
      assignedById: savedAssignment.assignedById,
    };

    await this.outboxService.createOutboxEvent({
      aggregateId: savedAssignment.id,
      aggregateType: 'Assignment',
      eventType: EVENT_TYPES.TICKET_ASSIGNED,
      payload: eventPayload,
      kafkaTopic: KAFKA_TOPICS.ASSIGNMENT_EVENTS,
    });

    return this.mapToResponseDto(savedAssignment);
  }

  async unassign(
    unassignTicketDto: UnassignTicketDto,
    unassignedById: string,
  ): Promise<void> {
    const assignment = await this.assignmentRepository.findOne({
      where: {
        ticketId: unassignTicketDto.ticketId,
        userId: unassignTicketDto.userId,
      },
    });

    if (!assignment) {
      throw new NotFoundException(
        `Assignment not found for user ${unassignTicketDto.userId} and ticket ${unassignTicketDto.ticketId}`,
      );
    }

    await this.assignmentRepository.remove(assignment);

    // Create outbox event
    const eventPayload: Omit<TicketUnassignedEvent, 'eventId' | 'timestamp'> = {
      assignmentId: assignment.id,
      ticketId: assignment.ticketId,
      userId: assignment.userId,
      unassignedById,
    };

    await this.outboxService.createOutboxEvent({
      aggregateId: assignment.id,
      aggregateType: 'Assignment',
      eventType: EVENT_TYPES.TICKET_UNASSIGNED,
      payload: eventPayload,
      kafkaTopic: KAFKA_TOPICS.ASSIGNMENT_EVENTS,
    });
  }

  async findAll(
    getAssignmentsDto: GetAssignmentsDto,
  ): Promise<{ data: AssignmentResponseDto[]; total: number }> {
    const query = this.assignmentRepository.createQueryBuilder('assignment');

    if (getAssignmentsDto.ticketId) {
      query.andWhere('assignment.ticket_id = :ticketId', {
        ticketId: getAssignmentsDto.ticketId,
      });
    }

    if (getAssignmentsDto.userId) {
      query.andWhere('assignment.user_id = :userId', { userId: getAssignmentsDto.userId });
    }

    const page = getAssignmentsDto.page || 1;
    const limit = getAssignmentsDto.limit || 20;
    const skip = (page - 1) * limit;

    query.skip(skip).take(limit);
    query.orderBy('assignment.assigned_at', 'DESC');

    const [assignments, total] = await query.getManyAndCount();

    return {
      data: assignments.map((assignment) => this.mapToResponseDto(assignment)),
      total,
    };
  }

  async findByTicket(ticketId: string): Promise<AssignmentResponseDto[]> {
    const assignments = await this.assignmentRepository.find({
      where: { ticketId },
      order: { assignedAt: 'DESC' },
    });
    return assignments.map((assignment) => this.mapToResponseDto(assignment));
  }

  async findByUser(userId: string): Promise<AssignmentResponseDto[]> {
    const assignments = await this.assignmentRepository.find({
      where: { userId },
      order: { assignedAt: 'DESC' },
    });
    return assignments.map((assignment) => this.mapToResponseDto(assignment));
  }

  private mapToResponseDto(assignment: Assignment): AssignmentResponseDto {
    return {
      id: assignment.id,
      ticketId: assignment.ticketId,
      userId: assignment.userId,
      assignedById: assignment.assignedById,
      assignedAt: assignment.assignedAt,
    };
  }
}
