import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { AccessTokenPayload } from '../../modules/auth/application/services/token.service';

function buildContext(user?: AccessTokenPayload): ExecutionContext {
  return {
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const buildGuard = (requiredRoles: Role[] | undefined) => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  };

  it('allows access when the route has no @Roles() requirement', () => {
    const guard = buildGuard(undefined);
    const context = buildContext({ sub: 'u1', email: 'a@b.com', role: Role.CLIENT, type: 'access' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows access when the user has the required role', () => {
    const guard = buildGuard([Role.ADMIN]);
    const context = buildContext({ sub: 'u1', email: 'admin@findash.dev', role: Role.ADMIN, type: 'access' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('blocks a CLIENT from a route that requires ADMIN', () => {
    const guard = buildGuard([Role.ADMIN]);
    const context = buildContext({ sub: 'u1', email: 'client@findash.dev', role: Role.CLIENT, type: 'access' });
    expect(guard.canActivate(context)).toBe(false);
  });

  it('blocks when there is no authenticated user on the request', () => {
    const guard = buildGuard([Role.ADMIN]);
    const context = buildContext(undefined);
    expect(guard.canActivate(context)).toBe(false);
  });
});
