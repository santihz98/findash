import { Inject, Injectable } from '@nestjs/common';
import { DASHBOARD_REPOSITORY, DashboardKpis, IDashboardRepository } from '../../domain/ports/dashboard.repository.port';

// RF-07. Wrapper delgado (RN-04) — la agregación real vive en el repo
// (SQL/Postgres), no acá; mismo patrón que GetMyAccountsUseCase.
@Injectable()
export class GetKpisUseCase {
  constructor(@Inject(DASHBOARD_REPOSITORY) private readonly dashboardRepository: IDashboardRepository) {}

  execute(): Promise<DashboardKpis> {
    return this.dashboardRepository.getKpis();
  }
}
