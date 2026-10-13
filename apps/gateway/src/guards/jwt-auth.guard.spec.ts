import { INestApplication, Logger } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '@gateway/guards/jwt-auth.guard';
import { JwtStrategy } from '@gateway/guards/jwt.strategy';
import { TicketsController } from '../modules/tickets/tickets.controller';
import { TicketsService } from '../modules/tickets/tickets.service';
import { AuthController } from '../modules/auth/auth.controller';
import { AuthService } from '../modules/auth/auth.service';

const JWT_SECRET = 'gateway-test-secret';

/**
 * Boots the real gateway routing + Passport JWT strategy + global guard over HTTP,
 * with the downstream HTTP proxies (TicketsService/AuthService) mocked.
 */
describe('Gateway routing and JWT guard (HTTP)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const jwt = new JwtService({ secret: JWT_SECRET });

  const ticketsService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const authService = {
    login: jest.fn(),
    register: jest.fn(),
    refreshToken: jest.fn(),
    logout: jest.fn(),
    getProfile: jest.fn(),
  };

  const request = (path: string, init: RequestInit = {}) => fetch(`${baseUrl}${path}`, init);
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    Logger.overrideLogger(false);

    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [TicketsController, AuthController],
      providers: [
        JwtStrategy,
        { provide: TicketsService, useValue: ticketsService },
        { provide: AuthService, useValue: authService },
        {
          provide: APP_GUARD,
          useFactory: (reflector: Reflector) => new JwtAuthGuard(reflector),
          inject: [Reflector],
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    baseUrl = `${await app.getUrl()}/api/v1`.replace('[::1]', '127.0.0.1');
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => jest.clearAllMocks());

  it('rejects requests without a bearer token with 401', async () => {
    const res = await request('/tickets');

    expect(res.status).toBe(401);
    expect(ticketsService.findAll).not.toHaveBeenCalled();
  });

  it('rejects malformed tokens with 401', async () => {
    const res = await request('/tickets', { headers: bearer('not-a-jwt') });

    expect(res.status).toBe(401);
  });

  it('rejects tokens signed with a different secret with 401', async () => {
    const forged = new JwtService({ secret: 'attacker' }).sign({ userId: 'u-1', role: 'ADMIN' });

    const res = await request('/tickets', { headers: bearer(forged) });

    expect(res.status).toBe(401);
  });

  it('rejects expired tokens with 401', async () => {
    const expired = jwt.sign(
      { userId: 'u-1', email: 'a@b.c', role: 'DEVELOPER' },
      { expiresIn: '-10s' },
    );

    const res = await request('/tickets', { headers: bearer(expired) });

    expect(res.status).toBe(401);
  });

  it('routes authenticated requests to the ticket proxy', async () => {
    ticketsService.findAll.mockResolvedValue({ data: [], total: 0 });
    const token = jwt.sign({ userId: 'u-1', email: 'a@b.c', role: 'DEVELOPER' });

    const res = await request('/tickets?status=TODO', { headers: bearer(token) });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: [], total: 0 });
    expect(ticketsService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'TODO' }),
    );
  });

  it('passes the user id from the JWT to downstream services', async () => {
    ticketsService.create.mockResolvedValue({ id: 'ticket-1' });
    const token = jwt.sign({ userId: 'user-42', email: 'a@b.c', role: 'DEVELOPER' });

    const res = await request('/tickets', {
      method: 'POST',
      headers: { ...bearer(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New ticket' }),
    });

    expect(res.status).toBe(201);
    expect(ticketsService.create).toHaveBeenCalledWith({ title: 'New ticket' }, 'user-42');
  });

  it('lets @Public() routes (login) through without a token', async () => {
    authService.login.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });

    const res = await request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.c', password: 'secret' }),
    });

    expect(res.status).toBe(200);
    expect(authService.login).toHaveBeenCalledWith({ email: 'a@b.c', password: 'secret' });
  });

  it('protects non-public auth routes such as /auth/me', async () => {
    const res = await request('/auth/me');

    expect(res.status).toBe(401);
    expect(authService.getProfile).not.toHaveBeenCalled();
  });
});
