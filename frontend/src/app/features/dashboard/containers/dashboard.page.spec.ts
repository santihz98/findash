import { DeferBlockBehavior, DeferBlockState, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Store } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';

import { dashboardActions } from '../../../state/dashboard/dashboard.actions';
import { initialDashboardState } from '../../../state/dashboard/dashboard.model';
import { VolumeChartComponent } from '../components/volume-chart.component';
import { CHART_RENDERER } from '../services/chart-renderer.token';
import { DashboardPage } from './dashboard.page';

// `VolumeChartComponent` se monta de verdad acá una vez que el `@defer`
// resuelve — necesita un `IChartRenderer` real para no crashear (Chart.js
// necesita un canvas 2D que jsdom no implementa). Se reemplaza el puerto
// `CHART_RENDERER` vía `TestBed.overrideComponent` sobre el componente hoja
// (nunca mockeando el módulo `chart.js` — ver `chart-renderer.token.ts` y
// `volume-chart.component.spec.ts` para el porqué).
const fakeChartRenderer = { render: vi.fn(() => ({ destroy: vi.fn() })) };

async function create() {
  // `DashboardPage` tiene un bloque `@defer` — Angular adjunta metadata
  // async a la clase compilada para poder resolver esa dependencia
  // diferida. Dos requisitos, ninguno opcional:
  // 1. `DashboardPage` tiene que estar en `imports` de
  //    `configureTestingModule` (los standalone pueden ir ahí) ANTES de
  //    `compileComponents()` — si no, el compilador nunca se entera de
  //    que esta clase en particular tiene metadata async pendiente, y
  //    `createComponent()` sigue tirando "Component has unresolved
  //    metadata" aunque ya se haya llamado a `compileComponents()`.
  // 2. `deferBlockBehavior: Manual` — el trigger real (`on viewport`)
  //    depende de `IntersectionObserver`, que jsdom no implementa
  //    (confirmado: sin esto, el test explota con
  //    "ReferenceError: IntersectionObserver is not defined" apenas
  //    Angular intenta registrar el observer). Manual permite forzar el
  //    estado del bloque (`Placeholder`/`Complete`) sin depender de esa
  //    API del browser.
  TestBed.configureTestingModule({
    deferBlockBehavior: DeferBlockBehavior.Manual,
    imports: [DashboardPage],
    providers: [provideMockStore({ initialState: { dashboard: initialDashboardState } })],
  });
  TestBed.overrideComponent(VolumeChartComponent, {
    set: { providers: [{ provide: CHART_RENDERER, useValue: fakeChartRenderer }] },
  });
  await TestBed.compileComponents();

  const store = TestBed.inject(Store) as MockStore;
  const dispatchSpy = vi.spyOn(store, 'dispatch');
  const fixture = TestBed.createComponent(DashboardPage);
  fixture.detectChanges();

  return { fixture, store, dispatchSpy };
}

describe('DashboardPage', () => {
  it('dispatches both loadKpis and loadVolumeByAccountType on init (tarea 3, dos cargas independientes)', async () => {
    const { dispatchSpy } = await create();

    expect(dispatchSpy).toHaveBeenCalledWith(dashboardActions.loadKpis());
    expect(dispatchSpy).toHaveBeenCalledWith(dashboardActions.loadVolumeByAccountType());
  });

  describe('sección de KPIs (3 estados)', () => {
    it('shows the skeleton loader during the initial load', async () => {
      const { fixture, store } = await create();
      store.setState({ dashboard: { ...initialDashboardState, kpisLoading: true } });
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.css('app-skeleton-loader'))).toBeTruthy();
      expect(fixture.debugElement.query(By.css('app-kpi-cards'))).toBeFalsy();
    });

    it('shows an error banner with retry, without crashing, when the kpis fail to load', async () => {
      const { fixture, store } = await create();
      store.setState({
        dashboard: { ...initialDashboardState, kpisLoaded: true, kpisError: 'No se pudieron cargar' },
      });
      fixture.detectChanges();

      const banner = fixture.debugElement.query(By.css('.error-banner'));
      expect(banner.nativeElement.textContent).toContain('No se pudieron cargar');
      expect(banner.query(By.css('button'))).toBeTruthy();
    });

    it('retrying the kpis re-dispatches loadKpis', async () => {
      const { fixture, store, dispatchSpy } = await create();
      store.setState({
        dashboard: { ...initialDashboardState, kpisLoaded: true, kpisError: 'boom' },
      });
      fixture.detectChanges();
      dispatchSpy.mockClear();

      fixture.debugElement.query(By.css('.error-banner button')).nativeElement.click();

      expect(dispatchSpy).toHaveBeenCalledWith(dashboardActions.loadKpis());
    });

    it('renders app-kpi-cards with the resolved kpis, dimmed while refetching', async () => {
      const { fixture, store } = await create();
      const kpis = { totalVolumeTransacted: '434.00', failedOrRejectedCount: 48 };
      store.setState({
        dashboard: { ...initialDashboardState, kpis, kpisLoaded: true, kpisLoading: true },
      });
      fixture.detectChanges();

      const cards = fixture.debugElement.query(By.css('app-kpi-cards'));
      expect(cards).toBeTruthy();
      expect(cards.nativeElement.parentElement.classList).toContain('refetching');
    });
  });

  describe('sección del gráfico (3 estados + @defer)', () => {
    it('shows the skeleton loader during the initial load, without even mounting the @defer block', async () => {
      const { fixture, store } = await create();
      store.setState({ dashboard: { ...initialDashboardState, volumeLoading: true } });
      fixture.detectChanges();

      expect(
        fixture.debugElement.query(By.css('.dashboard-page__chart-section app-skeleton-loader')),
      ).toBeTruthy();
      expect(fixture.debugElement.query(By.css('.dashboard-page__chart-card'))).toBeFalsy();
    });

    it('shows an error banner with retry when the volume fails to load', async () => {
      const { fixture, store } = await create();
      store.setState({
        dashboard: { ...initialDashboardState, volumeLoaded: true, volumeError: 'No se pudo cargar' },
      });
      fixture.detectChanges();

      const banners = fixture.debugElement.queryAll(By.css('.error-banner'));
      const chartError = banners.find((b) => b.nativeElement.textContent.includes('No se pudo cargar'));
      expect(chartError).toBeTruthy();
    });

    it('retrying the volume re-dispatches loadVolumeByAccountType', async () => {
      const { fixture, store, dispatchSpy } = await create();
      store.setState({
        dashboard: { ...initialDashboardState, volumeLoaded: true, volumeError: 'boom' },
      });
      fixture.detectChanges();
      dispatchSpy.mockClear();

      const banners = fixture.debugElement.queryAll(By.css('.error-banner'));
      const chartBanner = banners.find((b) => b.nativeElement.textContent.includes('boom'));
      chartBanner!.query(By.css('button')).nativeElement.click();

      expect(dispatchSpy).toHaveBeenCalledWith(dashboardActions.loadVolumeByAccountType());
    });

    it('does not mount app-volume-chart before the @defer trigger fires (RNF-04, tarea 1/9)', async () => {
      const { fixture, store } = await create();
      store.setState({
        dashboard: { ...initialDashboardState, volumeLoaded: true, volumeByAccountType: [] },
      });
      fixture.detectChanges();

      const deferBlocks = await fixture.getDeferBlocks();
      expect(deferBlocks).toHaveLength(1);
      // Sin renderizar todavía: app-volume-chart no está en el DOM — el
      // chunk que lo contiene (con Chart.js adentro) ni se pidió.
      expect(fixture.debugElement.query(By.css('app-volume-chart'))).toBeFalsy();

      await deferBlocks[0].render(DeferBlockState.Placeholder);
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('app-skeleton-loader'))).toBeTruthy();
    });

    it('the @loading and @error states of the @defer block render coherently with the design system', async () => {
      const { fixture, store } = await create();
      store.setState({
        dashboard: { ...initialDashboardState, volumeLoaded: true, volumeByAccountType: [] },
      });
      fixture.detectChanges();

      const deferBlocks = await fixture.getDeferBlocks();

      await deferBlocks[0].render(DeferBlockState.Loading);
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('app-skeleton-loader'))).toBeTruthy();

      await deferBlocks[0].render(DeferBlockState.Error);
      fixture.detectChanges();
      expect(
        fixture.debugElement.query(By.css('.dashboard-page__chart-card .error-banner')).nativeElement
          .textContent,
      ).toContain('No se pudo cargar el gráfico');
    });

    it('once the @defer block completes, renders app-volume-chart with the resolved data', async () => {
      const volumeByAccountType = [{ accountType: 'BASIC' as const, totalVolume: '427.00' }];
      const { fixture, store } = await create();
      store.setState({
        dashboard: { ...initialDashboardState, volumeLoaded: true, volumeByAccountType },
      });
      fixture.detectChanges();

      const deferBlocks = await fixture.getDeferBlocks();
      await deferBlocks[0].render(DeferBlockState.Complete);
      fixture.detectChanges();

      const chart = fixture.debugElement.query(By.css('app-volume-chart'));
      expect(chart).toBeTruthy();
      expect(chart.componentInstance.data()).toEqual(volumeByAccountType);
    });
  });
});
