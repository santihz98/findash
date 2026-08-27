import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LoginUseCase } from '../application/use-cases/login.use-case';
import { RefreshTokenUseCase } from '../application/use-cases/refresh-token.use-case';
import { GetMeUseCase } from '../application/use-cases/get-me.use-case';
import { AccessTokenPayload } from '../application/services/token.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';

// Controlador "tonto" (RN-04, ARCHITECTURE.md 3.2): dto -> command -> use
// case -> response. Cero lógica de negocio acá.
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
    private readonly getMeUseCase: GetMeUseCase,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login con email + password, devuelve access token + refresh token' })
  @ApiResponse({
    status: 200,
    description: 'Credenciales válidas.',
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'email inválido o password vacío (validación del DTO).' })
  @ApiResponse({
    status: 401,
    description: 'Email inexistente o password incorrecta — mismo mensaje genérico para ambos casos.',
    schema: { example: { statusCode: 401, message: 'Credenciales inválidas', error: 'Unauthorized' } },
  })
  login(@Body() dto: LoginDto) {
    return this.loginUseCase.execute(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Canjea un refresh token válido por un access token nuevo' })
  @ApiResponse({
    status: 200,
    description: 'Refresh token válido.',
    schema: { example: { accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' } },
  })
  @ApiResponse({ status: 400, description: 'refreshToken vacío (validación del DTO).' })
  @ApiResponse({
    status: 401,
    description: 'Refresh token inválido, expirado, de tipo incorrecto, o el usuario ya no existe.',
  })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.refreshTokenUseCase.execute(dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('me')
  @ApiOperation({ summary: 'Perfil del usuario autenticado (a partir del access token)' })
  @ApiResponse({
    status: 200,
    description: 'Cualquier rol autenticado.',
    schema: {
      example: {
        id: '1506b629-2118-4dfb-979e-162ae6d866bd',
        email: 'admin@findash.dev',
        documentNumber: '1010000001',
        role: 'ADMIN',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Token ausente, inválido, expirado, o el usuario ya no existe.' })
  me(@CurrentUser() user: AccessTokenPayload) {
    return this.getMeUseCase.execute(user.sub);
  }
}
