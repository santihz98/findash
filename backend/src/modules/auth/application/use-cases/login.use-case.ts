import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../domain/ports/user.repository.port';
import { PasswordHasherService } from '../services/password-hasher.service';
import { TokenService } from '../services/token.service';

export interface LoginCommand {
  email: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
    private readonly passwordHasher: PasswordHasherService,
    private readonly tokenService: TokenService,
  ) {}

  async execute(command: LoginCommand): Promise<LoginResult> {
    const user = await this.userRepository.findByEmail(command.email);
    if (!user) {
      // Mismo mensaje que password incorrecta: no revelar si el email
      // existe o no en el sistema.
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordMatches = await this.passwordHasher.compare(command.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return {
      accessToken: this.tokenService.signAccessToken(user),
      refreshToken: this.tokenService.signRefreshToken(user),
    };
  }
}
