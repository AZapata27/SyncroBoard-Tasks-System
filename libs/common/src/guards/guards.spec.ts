import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../decorators';

const createContext = (user?: Record<string, unknown>): ExecutionContext =>
  ({
    getHandler: () => () => undefined,
    getClass: () => class TestController {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

const reflectorReturning = (metadata: Record<string, unknown>): Reflector =>
  ({
    getAllAndOverride: jest.fn((key: string) => metadata[key]),
  }) as unknown as Reflector;

describe('JwtAuthGuard (common)', () => {
  it('allows routes marked as @Public() without a user', () => {
    const guard = new JwtAuthGuard(reflectorReturning({ [IS_PUBLIC_KEY]: true }));
    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('rejects protected routes when the request has no authenticated user', () => {
    const guard = new JwtAuthGuard(reflectorReturning({}));
    expect(() => guard.canActivate(createContext())).toThrow(UnauthorizedException);
  });

  it('allows protected routes when the request carries a user', () => {
    const guard = new JwtAuthGuard(reflectorReturning({}));
    expect(guard.canActivate(createContext({ userId: 'u-1', role: 'DEVELOPER' }))).toBe(true);
  });
});

describe('RolesGuard', () => {
  it('allows access when the handler declares no roles', () => {
    const guard = new RolesGuard(reflectorReturning({}));
    expect(guard.canActivate(createContext({ role: 'VIEWER' }))).toBe(true);
  });

  it('allows access when the user has one of the required roles', () => {
    const guard = new RolesGuard(reflectorReturning({ [ROLES_KEY]: ['ADMIN', 'PROJECT_MANAGER'] }));
    expect(guard.canActivate(createContext({ role: 'PROJECT_MANAGER' }))).toBe(true);
  });

  it('forbids access when the user lacks the required role', () => {
    const guard = new RolesGuard(reflectorReturning({ [ROLES_KEY]: ['ADMIN'] }));
    expect(() => guard.canActivate(createContext({ role: 'DEVELOPER' }))).toThrow(
      ForbiddenException,
    );
  });

  it('forbids access when there is no user in the request', () => {
    const guard = new RolesGuard(reflectorReturning({ [ROLES_KEY]: ['ADMIN'] }));
    expect(() => guard.canActivate(createContext())).toThrow(ForbiddenException);
  });
});
