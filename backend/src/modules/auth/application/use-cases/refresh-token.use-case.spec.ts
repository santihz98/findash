import { UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { RefreshTokenUseCase } from './refresh-token.use-case';
import { IUserRepository } from '../../domain/ports/user.repository.port';
import { TokenService } from '../services/token.service';

describe('RefreshTokenUseCase', () => {
  const existingUser = {
    id: 'user-1',
    email: 'client@findash.dev',
    documentNumber: '1010000002',
    passwordHash: 'hashed-password',
    role: Role.CLIENT,
  };

  let userRepository: jest.Mocked<IUserRepository>;
  let tokenService: jest.Mocked<TokenService>;
  let useCase: RefreshTokenUseCase;

  beforeEach(() => {
    userRepository = { findByEmail: jest.fn(), findById: jest.fn() };
    tokenService = {
      verifyRefreshToken: jest.fn(),
      signAccessToken: jest.fn().mockReturnValue('new-access-token'),
    } as unknown as jest.Mocked<TokenService>;

    useCase = new RefreshTokenUseCase(userRepository, tokenService);
  });

  it('issues a new access token for a valid refresh token', async () => {
    tokenService.verifyRefreshToken.mockReturnValue({ sub: existingUser.id, type: 'refresh' });
    userRepository.findById.mockResolvedValue(existingUser);

    const result = await useCase.execute({ refreshToken: 'valid-refresh-token' });

    expect(result).toEqual({ accessToken: 'new-access-token' });
    expect(tokenService.signAccessToken).toHaveBeenCalledWith(existingUser);
  });

  it('propagates the error from an invalid/expired refresh token', async () => {
    tokenService.verifyRefreshToken.mockImplementation(() => {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    });

    await expect(useCase.execute({ refreshToken: 'bad-token' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(userRepository.findById).not.toHaveBeenCalled();
  });

  it('rejects when the user behind a valid refresh token no longer exists', async () => {
    tokenService.verifyRefreshToken.mockReturnValue({ sub: 'deleted-user', type: 'refresh' });
    userRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute({ refreshToken: 'valid-but-orphaned' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tokenService.signAccessToken).not.toHaveBeenCalled();
  });
});
