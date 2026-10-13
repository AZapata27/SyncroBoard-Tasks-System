import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OutboxService } from '@app/common';
import { EVENT_TYPES, KAFKA_TOPICS, UserRole } from '@app/contracts';
import { CommentsService } from './comments.service';
import { Comment } from './comment.entity';

const buildComment = (overrides: Partial<Comment> = {}): Comment =>
  ({
    id: 'comment-1',
    ticketId: 'ticket-1',
    authorId: 'user-1',
    content: 'Reproduced on staging',
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    ...overrides,
  }) as Comment;

describe('CommentsService', () => {
  let service: CommentsService;
  const repository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };
  const outboxService = { createOutboxEvent: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: getRepositoryToken(Comment), useValue: repository },
        { provide: OutboxService, useValue: outboxService },
      ],
    }).compile();

    service = moduleRef.get(CommentsService);
  });

  it('creates a comment authored by the current user and records ticket.comment.added', async () => {
    const comment = buildComment();
    repository.create.mockReturnValue(comment);
    repository.save.mockResolvedValue(comment);

    const result = await service.create(
      { ticketId: 'ticket-1', content: 'Reproduced on staging' },
      'user-1',
    );

    expect(repository.create).toHaveBeenCalledWith({
      ticketId: 'ticket-1',
      authorId: 'user-1',
      content: 'Reproduced on staging',
    });
    expect(outboxService.createOutboxEvent).toHaveBeenCalledWith({
      aggregateId: 'comment-1',
      aggregateType: 'Comment',
      eventType: EVENT_TYPES.TICKET_COMMENT_ADDED,
      kafkaTopic: KAFKA_TOPICS.TICKET_EVENTS,
      payload: {
        ticketId: 'ticket-1',
        commentId: 'comment-1',
        authorId: 'user-1',
        content: 'Reproduced on staging',
      },
    });
    expect(result).toMatchObject({ id: 'comment-1', authorId: 'user-1' });
  });

  it('lists the comments of a ticket in chronological order', async () => {
    repository.find.mockResolvedValue([buildComment(), buildComment({ id: 'comment-2' })]);

    const result = await service.findByTicket('ticket-1');

    expect(repository.find).toHaveBeenCalledWith({
      where: { ticketId: 'ticket-1' },
      order: { createdAt: 'ASC' },
    });
    expect(result.map((c) => c.id)).toEqual(['comment-1', 'comment-2']);
  });

  it('lets the author delete their own comment', async () => {
    const comment = buildComment();
    repository.findOne.mockResolvedValue(comment);

    await service.delete('comment-1', { userId: 'user-1', role: UserRole.DEVELOPER });

    expect(repository.remove).toHaveBeenCalledWith(comment);
  });

  it('lets an ADMIN delete a comment written by someone else', async () => {
    const comment = buildComment({ authorId: 'user-1' });
    repository.findOne.mockResolvedValue(comment);

    await service.delete('comment-1', { userId: 'admin-1', role: UserRole.ADMIN });

    expect(repository.remove).toHaveBeenCalledWith(comment);
  });

  it.each([
    ['a developer', { userId: 'user-2', role: UserRole.DEVELOPER }],
    ['a project manager', { userId: 'user-2', role: UserRole.PROJECT_MANAGER }],
    ['a requester without role', { userId: 'user-2' }],
    ['a requester without identity', { userId: undefined as unknown as string }],
  ])(
    'rejects with ForbiddenException when %s tries to delete a comment of another user',
    async (_who, requester) => {
      repository.findOne.mockResolvedValue(buildComment({ authorId: 'user-1' }));

      await expect(service.delete('comment-1', requester)).rejects.toThrow(ForbiddenException);
      expect(repository.remove).not.toHaveBeenCalled();
    },
  );

  it('throws NotFoundException when deleting an unknown comment', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(service.delete('missing', { userId: 'user-1' })).rejects.toThrow(
      NotFoundException,
    );
    expect(repository.remove).not.toHaveBeenCalled();
  });
});
