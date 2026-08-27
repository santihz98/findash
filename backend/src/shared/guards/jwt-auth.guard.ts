import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Valida el access token (estrategia 'jwt', ver
 * modules/auth/infrastructure/strategies/jwt.strategy.ts) en cada request
 * protegido. Rechaza con 401 automáticamente si el token falta, es
 * inválido, o está expirado — eso lo resuelve passport-jwt al verificar el
 * JWT (el claim `exp` se chequea como parte de la firma).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
