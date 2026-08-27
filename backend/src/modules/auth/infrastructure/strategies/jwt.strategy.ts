import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AccessTokenPayload } from '../../application/services/token.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // getOrThrow, no un default hardcodeado: si JWT_SECRET no está seteado
      // el módulo debe fallar al arrancar, no arrancar "igual" con un
      // secreto adivinable.
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(payload: AccessTokenPayload): AccessTokenPayload {
    // Defensa en profundidad (ver TokenService): un refresh token nunca
    // debería llegar hasta acá porque usa otro secreto, pero si algo falla
    // en la configuración, este chequeo lo corta igual.
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Token inválido');
    }
    return payload;
  }
}
