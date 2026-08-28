import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { AccountTypeVolume, DashboardKpis } from '../../state/dashboard/dashboard.model';

/**
 * Único lugar que inyecta HttpClient para `GET /dashboard/*` (RNF-03) —
 * ni `DashboardPage` ni ningún componente presentacional lo hacen directo.
 */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);

  kpis(): Observable<DashboardKpis> {
    return this.http.get<DashboardKpis>('dashboard/kpis');
  }

  volumeByAccountType(): Observable<AccountTypeVolume[]> {
    return this.http.get<AccountTypeVolume[]>('dashboard/volume-by-account-type');
  }
}
