import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtStrategy } from './jwt.strategy';
import { AccessTokenPayload } from '../../application/services/token.service';

describe('JwtStrategy', () => {
  const configService = {
    getOrThrow: () => 'test-access-secret',
  } as unknown as ConfigService;

  const strategy = new JwtStrategy(configService);

  it('returns the payload as-is for a valid access token', () => {
    const payload: AccessTokenPayload = {
      sub: 'user-1',
      email: 'client@findash.dev',
      role: Role.CLIENT,
      type: 'access',
    };
    expect(strategy.validate(payload)).toBe(payload);
  });

  it('rejects a payload whose type is not "access"', () => {
    const payload = {
      sub: 'user-1',
      type: 'refresh',
    } as unknown as AccessTokenPayload;
    expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
  });
});
