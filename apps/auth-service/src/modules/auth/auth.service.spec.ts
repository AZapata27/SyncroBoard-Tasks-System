import { UnauthorizedException } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { OutboxService } from '@app/common';
import { EVENT_TYPES, KAFKA_TOPICS, UserRole, UserStatus } from '@app/contracts';
import { AuthService } from './auth.service';
import { UsersService } from '@auth/modules/users/users.service';
import { User } from '@auth/modules/users/user.entity';

const ACCESS_SECRET = 'test-access-secret';
const REFRESH_SECRET = 'test-refresh-secret';

const buildUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-1',
    email: 'ada@syncroboard.dev',
    passwordHash: 'hashed',
    firstName: 'Ada',
    lastName: 'Lovelace',
    role: UserRole.DEVELOPER,
    status: UserStatus.ACTIVE,
    refreshToken: null,
    lastLogin: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }) as User;

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;
  const usersService = {
    create: jest.fn(),
    findByEmail: jest.fn(),
    findById: jest.fn(),
    validatePassword: jest.fn(),
    updateLastLogin: jest.fn(),
    updateRefreshToken: jest.fn(),
  };
  const outboxService = { createOutboxEvent: jest.fn() };

  beforeAll(() => {
    process.env.JWT_REFRESH_SECRET = REFRESH_SECRET;
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: ACCESS_SECRET, signOptions: { expiresIn: '1h' } })],
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: OutboxService, useValue: outboxService },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    jwtService = moduleRef.get(JwtService);
  });

  describe('register', () => {
    it('creates the user, records a user.registered outbox event and issues tokens', async () => {
      const user = buildUser();
      usersService.create.mockResolvedValue(user);

      const result = await service.register({
        email: user.email,
        password: 'S3cret!',
        firstName: 'Ada',
        lastName: 'Lovelace',
      });

      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: user.email, role: UserRole.DEVELOPER }),
      );
      expect(outboxService.createOutboxEvent).toHaveBeenCalledWith({
        aggregateId: 'user-1',
        aggregateType: 'User',
        eventType: EVENT_TYPES.USER_REGISTERED,
        kafkaTopic: KAFKA_TOPICS.USER_EVENTS,
        payload: {
          userId: 'user-1',
          email: user.email,
          firstName: 'Ada',
          lastName: 'Lovelace',
        },
      });
      expect(result.user).toEqual({
        id: 'user-1',
        email: user.email,
        firstName: 'Ada',
        lastName: 'Lovelace',
        role: UserRole.DEVELOPER,
      });
      expect(result.expiresIn).toBe(3600);
    });

    it('propagates errors from user creation without emitting events', async () => {
      usersService.create.mockRejectedValue(new Error('duplicate'));

      await expect(
        service.register({ email: 'x@y.z', password: 'p', firstName: 'X', lastName: 'Y' }),
      ).rejects.toThrow('duplicate');
      expect(outboxService.createOutboxEvent).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('returns signed JWTs carrying userId, email and role', async () => {
      const user = buildUser({ role: UserRole.PROJECT_MANAGER });
      usersService.findByEmail.mockResolvedValue(user);
      usersService.validatePassword.mockResolvedValue(true);

      const result = await service.login({ email: user.email, password: 'S3cret!' });

      const access = jwtService.verify(result.accessToken, { secret: ACCESS_SECRET });
      expect(access).toMatchObject({
        userId: 'user-1',
        email: user.email,
        role: UserRole.PROJECT_MANAGER,
      });
      const refresh = jwtService.verify(result.refreshToken, { secret: REFRESH_SECRET });
      expect(refresh.userId).toBe('user-1');
      expect(() => jwtService.verify(result.accessToken, { secret: 'wrong-secret' })).toThrow();
      expect(usersService.updateLastLogin).toHaveBeenCalledWith('user-1');
    });

    it('stores only a bcrypt hash of the refresh token', async () => {
      usersService.findByEmail.mockResolvedValue(buildUser());
      usersService.validatePassword.mockResolvedValue(true);

      const result = await service.login({ email: 'ada@syncroboard.dev', password: 'S3cret!' });

      const [userId, storedHash] = usersService.updateRefreshToken.mock.calls[0];
      expect(userId).toBe('user-1');
      expect(storedHash).not.toBe(result.refreshToken);
      await expect(bcrypt.compare(result.refreshToken, storedHash)).resolves.toBe(true);
    });

    it('rejects unknown emails with a generic error', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(service.login({ email: 'nobody@x.dev', password: 'p' })).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );
      expect(usersService.validatePassword).not.toHaveBeenCalled();
    });

    it('rejects a wrong password with the same generic error', async () => {
      usersService.findByEmail.mockResolvedValue(buildUser());
      usersService.validatePassword.mockResolvedValue(false);

      await expect(
        service.login({ email: 'ada@syncroboard.dev', password: 'bad' }),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
      expect(usersService.updateLastLogin).not.toHaveBeenCalled();
    });

    it('rejects users whose account is not active', async () => {
      usersService.findByEmail.mockResolvedValue(buildUser({ status: UserStatus.SUSPENDED }));
      usersService.validatePassword.mockResolvedValue(true);

      await expect(service.login({ email: 'ada@syncroboard.dev', password: 'p' })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refreshToken', () => {
    it('rejects tokens that were not signed with the refresh secret', async () => {
      const forged = jwtService.sign({ userId: 'user-1' }, { secret: 'attacker' });

      await expect(service.refreshToken({ refreshToken: forged })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a valid token that does not match the stored hash', async () => {
      const token = jwtService.sign({ userId: 'user-1' }, { secret: REFRESH_SECRET });
      usersService.findById.mockResolvedValue(
        buildUser({ refreshToken: await bcrypt.hash('another-token', 4) }),
      );

      await expect(service.refreshToken({ refreshToken: token })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  it('logout clears the stored refresh token', async () => {
    await service.logout('user-1');

    expect(usersService.updateRefreshToken).toHaveBeenCalledWith('user-1', null);
  });
});
