import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AccessTokenPayload } from '../../modules/auth/application/services/token.service';

/**
 * Lee `request.user`, poblado por JwtAuthGuard (ver
 * shared/guards/jwt-auth.guard.ts) a partir del access token verificado.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AccessTokenPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
