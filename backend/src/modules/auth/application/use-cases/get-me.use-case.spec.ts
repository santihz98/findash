import { UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { GetMeUseCase } from './get-me.use-case';
import { IUserRepository } from '../../domain/ports/user.repository.port';

describe('GetMeUseCase', () => {
  const existingUser = {
    id: 'user-1',
    email: 'client@findash.dev',
    documentNumber: '1010000002',
    passwordHash: 'hashed-password',
    role: Role.CLIENT,
  };

  let userRepository: jest.Mocked<IUserRepository>;
  let useCase: GetMeUseCase;

  beforeEach(() => {
    userRepository = { findByEmail: jest.fn(), findById: jest.fn() };
    useCase = new GetMeUseCase(userRepository);
  });

  it('returns the user profile without passwordHash', async () => {
    userRepository.findById.mockResolvedValue(existingUser);

    const result = await useCase.execute(existingUser.id);

    expect(result).toEqual({
      id: existingUser.id,
      email: existingUser.email,
      documentNumber: existingUser.documentNumber,
      role: existingUser.role,
    });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('rejects when the user no longer exists', async () => {
    userRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute('ghost-id')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
