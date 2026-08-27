import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../domain/ports/user.repository.port';
import { TokenService } from '../services/token.service';

export interface RefreshTokenCommand {
  refreshToken: string;
}

export interface RefreshTokenResult {
  accessToken: string;
}

@Injectable()
export class RefreshTokenUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
    private readonly tokenService: TokenService,
  ) {}

  async execute(command: RefreshTokenCommand): Promise<RefreshTokenResult> {
    const payload = this.tokenService.verifyRefreshToken(command.refreshToken);

    // Se re-consulta el usuario (no se confía solo en el `sub` del token):
    // así, si el usuario fue borrado después de emitir el refresh token, el
    // refresh se corta acá en vez de emitir un access token para un usuario
    // que ya no existe.
    const user = await this.userRepository.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    return { accessToken: this.tokenService.signAccessToken(user) };
  }
}
