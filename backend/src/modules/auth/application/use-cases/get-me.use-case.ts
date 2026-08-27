import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IUserRepository, USER_REPOSITORY } from '../../domain/ports/user.repository.port';

export interface MeResult {
  id: string;
  email: string;
  documentNumber: string;
  role: Role;
}

@Injectable()
export class GetMeUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository) {}

  async execute(userId: string): Promise<MeResult> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    // Nunca devolver passwordHash, aunque el repo lo traiga.
    return {
      id: user.id,
      email: user.email,
      documentNumber: user.documentNumber,
      role: user.role,
    };
  }
}
