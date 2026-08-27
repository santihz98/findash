import { Inject, Injectable } from '@nestjs/common';
import {
  AccountTypeVolume,
  DASHBOARD_REPOSITORY,
  IDashboardRepository,
} from '../../domain/ports/dashboard.repository.port';

// RF-08. Wrapper delgado (RN-04) — el JOIN/GROUP BY real vive en el repo
// (SQL/Postgres), no acá; mismo patrón que GetMyAccountsUseCase.
@Injectable()
export class GetVolumeByAccountTypeUseCase {
  constructor(@Inject(DASHBOARD_REPOSITORY) private readonly dashboardRepository: IDashboardRepository) {}

  execute(): Promise<AccountTypeVolume[]> {
    return this.dashboardRepository.getVolumeByAccountType();
  }
}
