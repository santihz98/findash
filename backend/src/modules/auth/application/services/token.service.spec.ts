import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { TokenService } from './token.service';

describe('TokenService', () => {
  const env: Record<string, string> = {
    JWT_SECRET: 'test-access-secret',
    JWT_REFRESH_SECRET: 'test-refresh-secret',
  };

  let tokenService: TokenService;
  let jwtService: JwtService;

  beforeEach(() => {
    jwtService = new JwtService();
    const configService = {
      getOrThrow: (key: string) => {
        if (!(key in env)) throw new Error(`Missing env var ${key}`);
        return env[key];
      },
      get: (key: string, fallback?: string) => env[key] ?? fallback,
    } as unknown as ConfigService;
    tokenService = new TokenService(jwtService, configService);
  });

  const user = { id: 'user-1', email: 'client@findash.dev', role: Role.CLIENT };

  it('signs an access token that carries sub/email/role/type', () => {
    const token = tokenService.signAccessToken(user);
    const decoded = jwtService.verify(token, { secret: env.JWT_SECRET });
    expect(decoded).toMatchObject({ sub: user.id, email: user.email, role: user.role, type: 'access' });
  });

  it('signs a refresh token that carries only sub/type', () => {
    const token = tokenService.signRefreshToken(user);
    const decoded = jwtService.verify(token, { secret: env.JWT_REFRESH_SECRET });
    expect(decoded).toMatchObject({ sub: user.id, type: 'refresh' });
  });

  it('verifies a valid refresh token and returns its payload', () => {
    const token = tokenService.signRefreshToken(user);
    expect(tokenService.verifyRefreshToken(token)).toMatchObject({ sub: user.id, type: 'refresh' });
  });

  it('rejects a refresh token signed with the wrong secret', () => {
    const bogusToken = jwtService.sign({ sub: user.id, type: 'refresh' }, { secret: 'not-the-real-secret' });
    expect(() => tokenService.verifyRefreshToken(bogusToken)).toThrow(UnauthorizedException);
  });

  it('rejects an access token presented as a refresh token', () => {
    // Firmado con el secreto de refresh pero con type: 'access' — cubre la
    // defensa en profundidad del claim `type`, no solo el secreto.
    const accessLikeToken = jwtService.sign(
      { sub: user.id, email: user.email, role: user.role, type: 'access' },
      { secret: env.JWT_REFRESH_SECRET },
    );
    expect(() => tokenService.verifyRefreshToken(accessLikeToken)).toThrow(UnauthorizedException);
  });

  it('rejects an expired refresh token', () => {
    const expiredToken = jwtService.sign(
      { sub: user.id, type: 'refresh', exp: Math.floor(Date.now() / 1000) - 10 },
      { secret: env.JWT_REFRESH_SECRET },
    );
    expect(() => tokenService.verifyRefreshToken(expiredToken)).toThrow(UnauthorizedException);
  });
});
