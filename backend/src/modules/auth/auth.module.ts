import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './interfaces/auth.controller';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { RefreshTokenUseCase } from './application/use-cases/refresh-token.use-case';
import { GetMeUseCase } from './application/use-cases/get-me.use-case';
import { PasswordHasherService } from './application/services/password-hasher.service';
import { TokenService } from './application/services/token.service';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository';
import { USER_REPOSITORY } from './domain/ports/user.repository.port';
import { JwtStrategy } from './infrastructure/strategies/jwt.strategy';

@Module({
  // JwtModule se registra vacío a propósito: TokenService firma/verifica
  // pasando secret/expiresIn explícitos en cada llamada (access y refresh
  // usan secretos distintos, ver token.service.ts) en vez de depender de
  // una única configuración global del módulo.
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    LoginUseCase,
    RefreshTokenUseCase,
    GetMeUseCase,
    PasswordHasherService,
    TokenService,
    JwtStrategy,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
  ],
})
export class AuthModule {}
