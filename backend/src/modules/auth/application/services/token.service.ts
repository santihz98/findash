import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { Role } from '@prisma/client';

// jsonwebtoken tipa `expiresIn` como un literal de duración (ej. "15m"), no
// como `string` genérico. Los valores vienen de env vars (siempre strings)
// y se documentan como duraciones válidas en .env.example — el cast acá es
// deliberado, no una forma de silenciar un error real.
type ExpiresIn = JwtSignOptions['expiresIn'];

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
}

/**
 * Firma y verifica los dos JWT del sistema (access y refresh). Cada uno usa
 * su propio secreto de entorno (JWT_SECRET / JWT_REFRESH_SECRET) — nunca un
 * valor por defecto hardcodeado: `getOrThrow` revienta al arrancar/firmar si
 * la variable no está seteada, en vez de firmar en silencio con `undefined`.
 *
 * El claim `type` es una capa extra de defensa (mismo espíritu que RN-01,
 * ver ARCHITECTURE.md 3.4): aunque los dos tokens ya usan secretos
 * distintos, este claim evita que un refresh token se pueda colar como
 * access token si algún día ambos secretos terminaran siendo iguales por
 * error de configuración.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  signAccessToken(user: { id: string; email: string; role: Role }): string {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'access',
    };
    return this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m') as ExpiresIn,
    });
  }

  signRefreshToken(user: { id: string }): string {
    const payload: RefreshTokenPayload = { sub: user.id, type: 'refresh' };
    return this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d') as ExpiresIn,
    });
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    let payload: RefreshTokenPayload;
    try {
      payload = this.jwtService.verify<RefreshTokenPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    return payload;
  }
}
