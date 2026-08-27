import { UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { LoginUseCase } from './login.use-case';
import { IUserRepository } from '../../domain/ports/user.repository.port';
import { PasswordHasherService } from '../services/password-hasher.service';
import { TokenService } from '../services/token.service';

describe('LoginUseCase', () => {
  const existingUser = {
    id: 'user-1',
    email: 'client@findash.dev',
    documentNumber: '1010000002',
    passwordHash: 'hashed-password',
    role: Role.CLIENT,
  };

  let userRepository: jest.Mocked<IUserRepository>;
  let passwordHasher: jest.Mocked<PasswordHasherService>;
  let tokenService: jest.Mocked<TokenService>;
  let useCase: LoginUseCase;

  beforeEach(() => {
    userRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
    };
    passwordHasher = { compare: jest.fn(), hash: jest.fn() } as unknown as jest.Mocked<PasswordHasherService>;
    tokenService = {
      signAccessToken: jest.fn().mockReturnValue('access-token'),
      signRefreshToken: jest.fn().mockReturnValue('refresh-token'),
    } as unknown as jest.Mocked<TokenService>;

    useCase = new LoginUseCase(userRepository, passwordHasher, tokenService);
  });

  it('returns an access + refresh token pair on valid credentials', async () => {
    userRepository.findByEmail.mockResolvedValue(existingUser);
    passwordHasher.compare.mockResolvedValue(true);

    const result = await useCase.execute({ email: existingUser.email, password: 'Demo1234!' });

    expect(result).toEqual({ accessToken: 'access-token', refreshToken: 'refresh-token' });
    expect(passwordHasher.compare).toHaveBeenCalledWith('Demo1234!', existingUser.passwordHash);
    expect(tokenService.signAccessToken).toHaveBeenCalledWith(existingUser);
    expect(tokenService.signRefreshToken).toHaveBeenCalledWith(existingUser);
  });

  it('rejects with an unknown email', async () => {
    userRepository.findByEmail.mockResolvedValue(null);

    await expect(useCase.execute({ email: 'nobody@findash.dev', password: 'whatever' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(passwordHasher.compare).not.toHaveBeenCalled();
  });

  it('rejects with an incorrect password', async () => {
    userRepository.findByEmail.mockResolvedValue(existingUser);
    passwordHasher.compare.mockResolvedValue(false);

    await expect(
      useCase.execute({ email: existingUser.email, password: 'wrong-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokenService.signAccessToken).not.toHaveBeenCalled();
  });
});
