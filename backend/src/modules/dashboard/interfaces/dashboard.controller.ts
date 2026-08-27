import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { GetKpisUseCase } from '../application/use-cases/get-kpis.use-case';
import { GetVolumeByAccountTypeUseCase } from '../application/use-cases/get-volume-by-account-type.use-case';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';

// Controlador "tonto" (RN-04): use case -> response, sin lógica propia.
// Ambos endpoints son solo-ADMIN (RF-07/RF-08) — mismo criterio que
// GET /accounts (Sesión 3): un CLIENT no tiene ningún motivo de negocio
// para ver KPIs agregados de toda la plataforma.
@ApiTags('dashboard')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly getKpisUseCase: GetKpisUseCase,
    private readonly getVolumeByAccountTypeUseCase: GetVolumeByAccountTypeUseCase,
  ) {}

  @Get('kpis')
  @ApiOperation({
    summary: 'KPIs agregados de la plataforma: volumen total transaccionado y cantidad de fallidas/rechazadas (solo ADMIN)',
    description:
      'RF-07. totalVolumeTransacted suma únicamente transacciones COMPLETED (dinero que efectivamente se movió) — REJECTED/FAILED no cuentan como volumen transaccionado, ver PROGRESS.md Sesión 7. failedOrRejectedCount cuenta ambos status juntos.',
  })
  @ApiResponse({
    status: 200,
    description: 'En cero si todavía no hay transacciones — nunca un error.',
    schema: {
      example: {
        totalVolumeTransacted: '12345.67',
        failedOrRejectedCount: 3,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Token ausente, inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Autenticado pero no es ADMIN.' })
  kpis() {
    return this.getKpisUseCase.execute();
  }

  @Get('volume-by-account-type')
  @ApiOperation({
    summary: 'Volumen de transacciones COMPLETED agrupado por tipo de cuenta origen (solo ADMIN)',
    description:
      'RF-08. Un elemento por AccountType con al menos una transacción COMPLETED como origen — un tipo sin transferencias completadas no aparece en el array (no aparece con "0.00"). Formato listo para graficar sin transformación adicional.',
  })
  @ApiResponse({
    status: 200,
    description: 'Array vacío si todavía no hay transacciones COMPLETED — nunca un error.',
    schema: {
      example: [
        { accountType: 'BASIC', totalVolume: '1234.56' },
        { accountType: 'PREMIUM', totalVolume: '890.00' },
        { accountType: 'CORPORATE', totalVolume: '50000.00' },
      ],
    },
  })
  @ApiResponse({ status: 401, description: 'Token ausente, inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Autenticado pero no es ADMIN.' })
  volumeByAccountType() {
    return this.getVolumeByAccountTypeUseCase.execute();
  }
}
