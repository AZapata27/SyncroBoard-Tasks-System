import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { UserRole, UserStatus } from '@app/contracts';
import { UsersService } from './users.service';
import { User } from './user.entity';

describe('UsersService', () => {
  let service: UsersService;
  const repository = {
    findOne: jest.fn(),
    create: jest.fn((data: Partial<User>) => ({ ...data }) as User),
    save: jest.fn(async (user: User) => ({ ...user, id: 'user-1' }) as User),
    update: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: getRepositoryToken(User), useValue: repository }],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  it('hashes the password with bcrypt and never stores it in plain text', async () => {
    repository.findOne.mockResolvedValue(null);

    const user = await service.create({
      email: 'ada@syncroboard.dev',
      password: 'S3cret!',
      firstName: 'Ada',
      lastName: 'Lovelace',
      role: UserRole.DEVELOPER,
    });

    expect(user.passwordHash).toBeDefined();
    expect(user.passwordHash).not.toBe('S3cret!');
    await expect(bcrypt.compare('S3cret!', user.passwordHash)).resolves.toBe(true);
    expect(user.role).toBe(UserRole.DEVELOPER);
    expect(user.status).toBe(UserStatus.ACTIVE);
  });

  it('rejects registration with an email that already exists', async () => {
    repository.findOne.mockResolvedValue({ id: 'existing' });

    await expect(
      service.create({
        email: 'dup@x.dev',
        password: 'p',
        firstName: 'D',
        lastName: 'U',
        role: UserRole.VIEWER,
      }),
    ).rejects.toThrow(ConflictException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('validates passwords against the stored hash', async () => {
    const passwordHash = await bcrypt.hash('correct-horse', 4);
    const user = { passwordHash } as User;

    await expect(service.validatePassword(user, 'correct-horse')).resolves.toBe(true);
    await expect(service.validatePassword(user, 'wrong')).resolves.toBe(false);
  });

  it('throws NotFoundException when a user id does not exist', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
  });
});
