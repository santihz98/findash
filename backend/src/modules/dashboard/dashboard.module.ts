import { Module } from '@nestjs/common';
import { DashboardController } from './interfaces/dashboard.controller';
import { GetKpisUseCase } from './application/use-cases/get-kpis.use-case';
import { GetVolumeByAccountTypeUseCase } from './application/use-cases/get-volume-by-account-type.use-case';
import { PrismaDashboardRepository } from './infrastructure/prisma-dashboard.repository';
import { DASHBOARD_REPOSITORY } from './domain/ports/dashboard.repository.port';

@Module({
  controllers: [DashboardController],
  providers: [
    GetKpisUseCase,
    GetVolumeByAccountTypeUseCase,
    { provide: DASHBOARD_REPOSITORY, useClass: PrismaDashboardRepository },
  ],
})
export class DashboardModule {}
