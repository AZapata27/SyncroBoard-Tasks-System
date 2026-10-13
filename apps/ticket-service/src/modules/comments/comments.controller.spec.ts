import { CanActivate, ExecutionContext, INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HttpExceptionFilter, JwtAuthGuard, JwtPayload, OutboxService } from '@app/common';
import { UserRole } from '@app/contracts';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { Comment } from './comment.entity';

/** Test stand-in for the authentication layer: the caller identity comes from x-test-user. */
class FakeAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const header = request.headers['x-test-user'];
    if (header) {
      request.user = JSON.parse(header) as Partial<JwtPayload>;
    }
    return true;
  }
}

/**
 * DELETE /comments/:id over HTTP with the real CommentsService (repository mocked):
 * only the author or an ADMIN can delete a comment.
 */
describe('CommentsController (HTTP)', () => {
  let app: INestApplication;
  let baseUrl: string;

  const repository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  const comment = { id: 'comment-1', ticketId: 'ticket-1', authorId: 'author-1', content: 'Hi' };

  const deleteAs = (user: Partial<JwtPayload>) =>
    fetch(`${baseUrl}/comments/comment-1`, {
      method: 'DELETE',
      headers: { 'x-test-user': JSON.stringify(user) },
    });

  beforeAll(async () => {
    Logger.overrideLogger(false);

    const moduleRef = await Test.createTestingModule({
      controllers: [CommentsController],
      providers: [
        CommentsService,
        { provide: getRepositoryToken(Comment), useValue: repository },
        { provide: OutboxService, useValue: { createOutboxEvent: jest.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(FakeAuthGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    baseUrl = `${await app.getUrl()}/api/v1`.replace('[::1]', '127.0.0.1');
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findOne.mockResolvedValue({ ...comment });
  });

  it('returns 403 and keeps the comment when another user tries to delete it', async () => {
    const res = await deleteAs({ userId: 'intruder-1', role: UserRole.DEVELOPER });

    expect(res.status).toBe(403);
    expect(repository.remove).not.toHaveBeenCalled();
  });

  it('lets the author delete the comment', async () => {
    const res = await deleteAs({ userId: 'author-1', role: UserRole.DEVELOPER });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ message: 'Comment deleted successfully' });
    expect(repository.remove).toHaveBeenCalledTimes(1);
  });

  it('lets an ADMIN delete a comment written by someone else', async () => {
    const res = await deleteAs({ userId: 'admin-1', role: UserRole.ADMIN });

    expect(res.status).toBe(200);
    expect(repository.remove).toHaveBeenCalledTimes(1);
  });

  it('returns 404 for an unknown comment', async () => {
    repository.findOne.mockResolvedValue(null);

    const res = await deleteAs({ userId: 'author-1', role: UserRole.DEVELOPER });

    expect(res.status).toBe(404);
  });
});
