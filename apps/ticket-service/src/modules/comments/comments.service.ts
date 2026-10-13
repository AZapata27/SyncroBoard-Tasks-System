import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from './comment.entity';
import { OutboxService } from '@app/common';
import {
  CreateCommentDto,
  CommentResponseDto,
  KAFKA_TOPICS,
  EVENT_TYPES,
  TicketCommentAddedEvent,
  UserRole,
} from '@app/contracts';

/** Who is asking for the operation (taken from the authenticated request). */
export interface CommentRequester {
  userId: string;
  role?: string;
}

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    private readonly outboxService: OutboxService,
  ) {}

  async create(createCommentDto: CreateCommentDto, userId: string): Promise<CommentResponseDto> {
    const comment = this.commentRepository.create({
      ticketId: createCommentDto.ticketId,
      authorId: userId,
      content: createCommentDto.content,
    });

    const savedComment = await this.commentRepository.save(comment);

    // Create outbox event
    const eventPayload: Omit<TicketCommentAddedEvent, 'eventId' | 'timestamp'> = {
      ticketId: savedComment.ticketId,
      commentId: savedComment.id,
      authorId: savedComment.authorId,
      content: savedComment.content,
    };

    await this.outboxService.createOutboxEvent({
      aggregateId: savedComment.id,
      aggregateType: 'Comment',
      eventType: EVENT_TYPES.TICKET_COMMENT_ADDED,
      payload: eventPayload,
      kafkaTopic: KAFKA_TOPICS.TICKET_EVENTS,
    });

    return this.mapToResponseDto(savedComment);
  }

  async findByTicket(ticketId: string): Promise<CommentResponseDto[]> {
    const comments = await this.commentRepository.find({
      where: { ticketId },
      order: { createdAt: 'ASC' },
    });
    return comments.map((comment) => this.mapToResponseDto(comment));
  }

  /**
   * Only the author of a comment, or an ADMIN, can delete it (403 otherwise).
   */
  async delete(id: string, requester: CommentRequester): Promise<void> {
    const comment = await this.commentRepository.findOne({ where: { id } });
    if (!comment) {
      throw new NotFoundException(`Comment with ID ${id} not found`);
    }

    const isAuthor = !!requester.userId && comment.authorId === requester.userId;
    const isAdmin = requester.role === UserRole.ADMIN;
    if (!isAuthor && !isAdmin) {
      throw new ForbiddenException('Only the author of the comment or an admin can delete it');
    }

    await this.commentRepository.remove(comment);
  }

  private mapToResponseDto(comment: Comment): CommentResponseDto {
    return {
      id: comment.id,
      ticketId: comment.ticketId,
      authorId: comment.authorId,
      content: comment.content,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    };
  }
}
