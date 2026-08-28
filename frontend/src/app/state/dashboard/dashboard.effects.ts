import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { DashboardService } from '../../core/services/dashboard.service';
import { extractErrorMessage } from '../../core/utils/extract-error-message.util';
import { dashboardActions } from './dashboard.actions';

/**
 * Dos effects independientes (no uno combinado con `forkJoin`) — mismo
 * criterio ya documentado en `dashboard.actions.ts`: cada `GET` tiene su
 * propio ciclo de éxito/fallo, `forkJoin` haría que un solo error tirara
 * abajo la respuesta del otro request aunque ya hubiera llegado bien.
 */
@Injectable()
export class DashboardEffects {
  private readonly actions$ = inject(Actions);
  private readonly dashboardService = inject(DashboardService);

  loadKpis$ = createEffect(() =>
    this.actions$.pipe(
      ofType(dashboardActions.loadKpis),
      switchMap(() =>
        this.dashboardService.kpis().pipe(
          map((kpis) => dashboardActions.loadKpisSuccess({ kpis })),
          catchError((error: HttpErrorResponse) =>
            of(
              dashboardActions.loadKpisFailure({
                error: extractErrorMessage(error, 'No se pudieron cargar los KPIs.'),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  loadVolumeByAccountType$ = createEffect(() =>
    this.actions$.pipe(
      ofType(dashboardActions.loadVolumeByAccountType),
      switchMap(() =>
        this.dashboardService.volumeByAccountType().pipe(
          map((volumeByAccountType) =>
            dashboardActions.loadVolumeByAccountTypeSuccess({ volumeByAccountType }),
          ),
          catchError((error: HttpErrorResponse) =>
            of(
              dashboardActions.loadVolumeByAccountTypeFailure({
                error: extractErrorMessage(error, 'No se pudo cargar el volumen por tipo de cuenta.'),
              }),
            ),
          ),
        ),
      ),
    ),
  );
}
