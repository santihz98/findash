import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AccessTokenPayload } from '../../modules/auth/application/services/token.service';

/**
 * RF-02 RBAC. Se asume que corre DESPUÉS de JwtAuthGuard en la cadena de
 * guards (`@UseGuards(JwtAuthGuard, RolesGuard)`), que es quien puebla
 * `request.user`. Rutas sin `@Roles(...)` quedan abiertas a cualquier
 * usuario autenticado — este guard solo restringe cuando el decorator está
 * presente.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AccessTokenPayload }>();
    const user = request.user;

    return !!user && requiredRoles.includes(user.role);
  }
}
