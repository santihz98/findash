import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../../shared/database/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verifica que el backend está arriba y conectado a Postgres' })
  @ApiResponse({
    status: 200,
    description: 'El backend responde y la conexión a la base de datos funciona.',
    schema: { example: { status: 'ok', database: 'connected' } },
  })
  @ApiResponse({
    status: 503,
    description: 'El backend responde pero no puede conectar a la base de datos.',
    schema: { example: { status: 'error', database: 'disconnected' } },
  })
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'connected' };
    } catch {
      throw new ServiceUnavailableException({ status: 'error', database: 'disconnected' });
    }
  }
}
