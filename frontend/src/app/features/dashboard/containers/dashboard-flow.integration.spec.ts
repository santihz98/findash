import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DeferBlockBehavior, DeferBlockState, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideEffects } from '@ngrx/effects';
import { Store, provideState, provideStore } from '@ngrx/store';

import { routes } from '../../../app.routes';
import { accountLookupFeature } from '../../../state/accountLookup/account-lookup.reducer';
import { CurrentUser } from '../../../state/auth/auth.model';
import { authFeature } from '../../../state/auth/auth.reducer';
import { DashboardEffects } from '../../../state/dashboard/dashboard.effects';
import { dashboardFeature } from '../../../state/dashboard/dashboard.reducer';
import { MyAccountEffects } from '../../../state/myAccount/my-account.effects';
import { myAccountFeature } from '../../../state/myAccount/my-account.reducer';
import { TransferEffects } from '../../../state/transfer/transfer.effects';
import { transferFeature } from '../../../state/transfer/transfer.reducer';
import { VolumeChartComponent } from '../components/volume-chart.component';
import { CHART_RENDERER } from '../services/chart-renderer.token';
import { DashboardPage } from './dashboard.page';

// `VolumeChartComponent` se monta de verdad una vez que el `@defer`
// resuelve — se reemplaza el puerto `CHART_RENDERER` vía
// `TestBed.overrideComponent` (nunca mockeando el módulo `chart.js` — ver
// dashboard.page.spec.ts / chart-renderer.token.ts para el porqué).
const fakeChartRenderer = { render: vi.fn(() => ({ destroy: vi.fn() })) };

const adminUser: CurrentUser = {
  id: 'user-1',
  email: 'admin@findash.dev',
  documentNumber: '1010000001',
  role: 'ADMIN',
};

const clientUser: CurrentUser = { ...adminUser, id: 'user-2', email: 'basic@findash.dev', role: 'CLIENT' };

/**
 * Test de integración real (tarea 11): Store + DashboardEffects + Router +
 * guards reales, sin mocks de NgRx. El único doble es
 * `HttpTestingController` — un backend fake, nunca el real.
 */
describe('dashboard flow (integración real, backend fake)', () => {
  let httpMock: HttpTestingController;

  function configure(user: CurrentUser): void {
    TestBed.configureTestingModule({
      // `on viewport` depende de `IntersectionObserver`, que jsdom no
      // implementa (confirmado: sin esto, explota con "IntersectionObserver
      // is not defined" en cuanto Angular intenta registrar el observer) —
      // `Manual` permite forzar el estado del `@defer` a mano, mismo
      // criterio que dashboard.page.spec.ts.
      deferBlockBehavior: DeferBlockBehavior.Manual,
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideStore({}),
        provideState(authFeature),
        provideState(dashboardFeature),
        // Registrados (con sus effects) para que un CLIENT redirigido a
        // /transfer no crashee — mismo criterio que
        // account-list-flow.integration.spec.ts /
        // transactions-audit-flow.integration.spec.ts.
        provideState(myAccountFeature),
        provideState(transferFeature),
        provideState(accountLookupFeature),
        provideEffects([DashboardEffects, MyAccountEffects, TransferEffects]),
      ],
    });
    TestBed.overrideComponent(VolumeChartComponent, {
      set: { providers: [{ provide: CHART_RENDERER, useValue: fakeChartRenderer }] },
    });
    httpMock = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(Store);
    store.dispatch({
      type: '[Auth] Login Success',
      user,
      accessToken: 'fake-access',
      refreshToken: 'fake-refresh',
    });
  }

  afterEach(() => httpMock.verify());

  it('loads real kpis + volume data and renders the chart once the @defer block resolves', async () => {
    configure(adminUser);
    const harness = await RouterTestingHarness.create('/dashboard');

    httpMock
      .expectOne((r) => r.url === 'dashboard/kpis')
      .flush({ totalVolumeTransacted: '434.00', failedOrRejectedCount: 48 });
    httpMock
      .expectOne((r) => r.url === 'dashboard/volume-by-account-type')
      .flush([
        { accountType: 'BASIC', totalVolume: '427.00' },
        { accountType: 'PREMIUM', totalVolume: '7.00' },
      ]);
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent).toContain('434.00');
    expect(harness.routeNativeElement?.textContent).toContain('48');

    const deferBlocks = await harness.fixture.getDeferBlocks();
    expect(deferBlocks).toHaveLength(1);
    await deferBlocks[0].render(DeferBlockState.Complete);
    harness.detectChanges();

    expect(harness.routeDebugElement!.query(By.css('app-volume-chart'))).toBeTruthy();
  });

  it('a CLIENT navigating directly to /dashboard never even reaches the component (roleGuard redirects to /transfer)', async () => {
    configure(clientUser);
    const harness = await RouterTestingHarness.create('/dashboard');

    expect(TestBed.inject(Router).url).toBe('/transfer');
    httpMock.expectNone((r) => r.url === 'dashboard/kpis');
    httpMock.expectNone((r) => r.url === 'dashboard/volume-by-account-type');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).not.toContain('Dashboard');

    // /transfer dispara su propia carga real (roleGuard lo dejó pasar de verdad).
    httpMock.expectOne((r) => r.url === 'accounts/me').flush([]);
  });

  it('defensa en profundidad: si el guard se sortea igual, un 403 real del backend se muestra como error, no rompe la página', async () => {
    TestBed.configureTestingModule({
      deferBlockBehavior: DeferBlockBehavior.Manual,
      providers: [
        provideRouter([
          {
            path: 'dashboard-unguarded',
            loadComponent: () => Promise.resolve(DashboardPage),
          },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideStore({}),
        provideState(dashboardFeature),
        provideEffects([DashboardEffects]),
      ],
    });
    TestBed.overrideComponent(VolumeChartComponent, {
      set: { providers: [{ provide: CHART_RENDERER, useValue: fakeChartRenderer }] },
    });
    httpMock = TestBed.inject(HttpTestingController);

    const harness = await RouterTestingHarness.create('/dashboard-unguarded');

    httpMock
      .expectOne((r) => r.url === 'dashboard/kpis')
      .flush(
        { statusCode: 403, message: 'Forbidden resource', error: 'Forbidden' },
        { status: 403, statusText: 'Forbidden' },
      );
    httpMock
      .expectOne((r) => r.url === 'dashboard/volume-by-account-type')
      .flush(
        { statusCode: 403, message: 'Forbidden resource', error: 'Forbidden' },
        { status: 403, statusText: 'Forbidden' },
      );

    await harness.fixture.whenStable();
    harness.detectChanges();

    const banners = harness.routeDebugElement!.queryAll(By.css('.error-banner'));
    expect(banners.length).toBeGreaterThanOrEqual(2);
    expect(banners.every((b) => b.nativeElement.textContent.includes('Forbidden resource'))).toBe(true);
  });
});
