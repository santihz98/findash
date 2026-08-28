import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Subject, firstValueFrom, of, throwError } from 'rxjs';

import { DashboardService } from '../../core/services/dashboard.service';
import { dashboardActions } from './dashboard.actions';
import { DashboardEffects } from './dashboard.effects';
import { AccountTypeVolume, DashboardKpis } from './dashboard.model';

const kpis: DashboardKpis = { totalVolumeTransacted: '434.00', failedOrRejectedCount: 48 };
const volume: AccountTypeVolume[] = [{ accountType: 'BASIC', totalVolume: '427.00' }];

describe('DashboardEffects', () => {
  let actions$: Subject<unknown>;
  let dashboardService: { kpis: ReturnType<typeof vi.fn>; volumeByAccountType: ReturnType<typeof vi.fn> };

  function setup(): DashboardEffects {
    actions$ = new Subject();
    dashboardService = { kpis: vi.fn(), volumeByAccountType: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        DashboardEffects,
        provideMockActions(() => actions$),
        { provide: DashboardService, useValue: dashboardService },
      ],
    });

    return TestBed.inject(DashboardEffects);
  }

  describe('loadKpis$', () => {
    it('dispatches loadKpisSuccess with the backend result on success', async () => {
      const effects = setup();
      dashboardService.kpis.mockReturnValue(of(kpis));

      const promise = firstValueFrom(effects.loadKpis$);
      actions$.next(dashboardActions.loadKpis());

      expect(await promise).toEqual(dashboardActions.loadKpisSuccess({ kpis }));
    });

    it('dispatches loadKpisFailure with the backend message on error', async () => {
      const effects = setup();
      dashboardService.kpis.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 403, error: { message: 'Forbidden resource' } })),
      );

      const promise = firstValueFrom(effects.loadKpis$);
      actions$.next(dashboardActions.loadKpis());

      expect(await promise).toEqual(dashboardActions.loadKpisFailure({ error: 'Forbidden resource' }));
    });

    it('dispatches loadKpisFailure with a fallback message when the backend gives no message', async () => {
      const effects = setup();
      dashboardService.kpis.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0, error: null })));

      const promise = firstValueFrom(effects.loadKpis$);
      actions$.next(dashboardActions.loadKpis());

      expect(await promise).toEqual(
        dashboardActions.loadKpisFailure({ error: 'No se pudieron cargar los KPIs.' }),
      );
    });

    it('cancels an in-flight request when a newer loadKpis is dispatched (switchMap)', async () => {
      const effects = setup();
      const firstResponse = new Subject<DashboardKpis>();
      const secondKpis: DashboardKpis = { totalVolumeTransacted: '999.00', failedOrRejectedCount: 1 };
      dashboardService.kpis.mockReturnValueOnce(firstResponse).mockReturnValueOnce(of(secondKpis));

      const emitted: unknown[] = [];
      const sub = effects.loadKpis$.subscribe((action) => emitted.push(action));

      actions$.next(dashboardActions.loadKpis());
      actions$.next(dashboardActions.loadKpis());
      firstResponse.next(kpis);
      firstResponse.complete();

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(emitted).toEqual([dashboardActions.loadKpisSuccess({ kpis: secondKpis })]);
      sub.unsubscribe();
    });
  });

  describe('loadVolumeByAccountType$', () => {
    it('dispatches loadVolumeByAccountTypeSuccess with the backend result on success', async () => {
      const effects = setup();
      dashboardService.volumeByAccountType.mockReturnValue(of(volume));

      const promise = firstValueFrom(effects.loadVolumeByAccountType$);
      actions$.next(dashboardActions.loadVolumeByAccountType());

      expect(await promise).toEqual(
        dashboardActions.loadVolumeByAccountTypeSuccess({ volumeByAccountType: volume }),
      );
    });

    it('dispatches loadVolumeByAccountTypeSuccess with an empty array without treating it as an error', async () => {
      const effects = setup();
      dashboardService.volumeByAccountType.mockReturnValue(of([]));

      const promise = firstValueFrom(effects.loadVolumeByAccountType$);
      actions$.next(dashboardActions.loadVolumeByAccountType());

      expect(await promise).toEqual(
        dashboardActions.loadVolumeByAccountTypeSuccess({ volumeByAccountType: [] }),
      );
    });

    it('dispatches loadVolumeByAccountTypeFailure with the backend message on error', async () => {
      const effects = setup();
      dashboardService.volumeByAccountType.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 403, error: { message: 'Forbidden resource' } })),
      );

      const promise = firstValueFrom(effects.loadVolumeByAccountType$);
      actions$.next(dashboardActions.loadVolumeByAccountType());

      expect(await promise).toEqual(
        dashboardActions.loadVolumeByAccountTypeFailure({ error: 'Forbidden resource' }),
      );
    });

    it('dispatches loadVolumeByAccountTypeFailure with a fallback message when the backend gives no message', async () => {
      const effects = setup();
      dashboardService.volumeByAccountType.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 0, error: null })),
      );

      const promise = firstValueFrom(effects.loadVolumeByAccountType$);
      actions$.next(dashboardActions.loadVolumeByAccountType());

      expect(await promise).toEqual(
        dashboardActions.loadVolumeByAccountTypeFailure({
          error: 'No se pudo cargar el volumen por tipo de cuenta.',
        }),
      );
    });

    it('cancels an in-flight request when a newer loadVolumeByAccountType is dispatched (switchMap)', async () => {
      const effects = setup();
      const firstResponse = new Subject<AccountTypeVolume[]>();
      const secondVolume: AccountTypeVolume[] = [{ accountType: 'CORPORATE', totalVolume: '5.00' }];
      dashboardService.volumeByAccountType
        .mockReturnValueOnce(firstResponse)
        .mockReturnValueOnce(of(secondVolume));

      const emitted: unknown[] = [];
      const sub = effects.loadVolumeByAccountType$.subscribe((action) => emitted.push(action));

      actions$.next(dashboardActions.loadVolumeByAccountType());
      actions$.next(dashboardActions.loadVolumeByAccountType());
      firstResponse.next(volume);
      firstResponse.complete();

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(emitted).toEqual([
        dashboardActions.loadVolumeByAccountTypeSuccess({ volumeByAccountType: secondVolume }),
      ]);
      sub.unsubscribe();
    });
  });
});
