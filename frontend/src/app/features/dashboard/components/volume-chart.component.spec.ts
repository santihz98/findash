import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { AccountTypeVolume } from '../../../state/dashboard/dashboard.model';
import { CHART_RENDERER, IChartRenderer } from '../services/chart-renderer.token';
import { VolumeChartComponent } from './volume-chart.component';

/**
 * Chart.js real necesita un `<canvas>` con contexto 2D de verdad, que
 * jsdom (el entorno de estos tests) no implementa. En vez de mockear el
 * MÓDULO `chart.js` (`vi.mock`) — que resultó intermitente bajo el test
 * runner de este proyecto (`@angular/build:unit-test` corre con
 * `isolate: false`: todos los archivos de un mismo worker comparten un
 * único registro de módulos, así que cuál mock "gana" para `chart.js`
 * termina dependiendo de qué archivo lo importa primero, no
 * determinístico entre corridas) — se reemplaza el PUERTO `CHART_RENDERER`
 * vía `TestBed.overrideComponent` (el propio mecanismo de DI de Angular,
 * que sí se resetea de forma confiable entre tests). Ver
 * `chart-renderer.token.ts` para el detalle completo de la decisión.
 *
 * Se prueba la lógica DE ESTE componente (transformación de datos,
 * destroy en cambios/`ngOnDestroy`, mensaje de vacío, leyenda de
 * "parcial") — nunca que Chart.js dibuje píxeles reales, eso no es
 * responsabilidad de este componente.
 */
const chartInstances: { config: { data: unknown }; destroy: ReturnType<typeof vi.fn> }[] = [];

const fakeChartRenderer: IChartRenderer = {
  render: vi.fn((_canvas: HTMLCanvasElement, config) => {
    const instance = { config, destroy: vi.fn() };
    chartInstances.push(instance);
    return instance;
  }),
};

function create(data: AccountTypeVolume[]) {
  TestBed.overrideComponent(VolumeChartComponent, {
    set: { providers: [{ provide: CHART_RENDERER, useValue: fakeChartRenderer }] },
  });
  const fixture = TestBed.createComponent(VolumeChartComponent);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  return fixture;
}

describe('VolumeChartComponent', () => {
  beforeEach(() => {
    chartInstances.length = 0;
  });

  it('shows an explicit empty-state message instead of a blank/broken canvas when there is no data yet (tarea 7)', () => {
    const fixture = create([]);

    expect(fixture.debugElement.query(By.css('canvas'))).toBeFalsy();
    expect(fixture.debugElement.query(By.css('.empty-state')).nativeElement.textContent).toContain(
      'Todavía no hay transferencias completadas',
    );
    expect(chartInstances).toHaveLength(0);
  });

  it('renders a canvas and builds the chart with all 3 account types when the data is complete', () => {
    const fixture = create([
      { accountType: 'BASIC', totalVolume: '427.00' },
      { accountType: 'PREMIUM', totalVolume: '7.00' },
      { accountType: 'CORPORATE', totalVolume: '50.00' },
    ]);

    expect(fixture.debugElement.query(By.css('canvas'))).toBeTruthy();
    expect(chartInstances).toHaveLength(1);
    expect((chartInstances[0].config.data as { labels: string[] }).labels).toEqual([
      'BASIC',
      'PREMIUM',
      'CORPORATE',
    ]);
    // Completo -> sin leyenda de "solo se muestran los tipos con datos".
    expect(fixture.debugElement.query(By.css('.volume-chart__caption'))).toBeFalsy();
  });

  it('renders correctly with partial data (a missing AccountType never breaks the render, tarea 6/10)', () => {
    const fixture = create([{ accountType: 'BASIC', totalVolume: '427.00' }]);

    expect(fixture.debugElement.query(By.css('canvas'))).toBeTruthy();
    expect(chartInstances).toHaveLength(1);
    expect((chartInstances[0].config.data as { labels: string[] }).labels).toEqual(['BASIC']);
    // La ausencia se explica con una leyenda, no se completa con un 0 inventado.
    const caption = fixture.debugElement.query(By.css('.volume-chart__caption'));
    expect(caption.nativeElement.textContent).toContain('Solo se muestran los tipos de cuenta');
  });

  it('falls back to a distinct color for an AccountType not in the known category map (ej. un futuro "VIP", Open/Closed)', () => {
    // jsdom no aplica styles.css real, así que `getComputedStyle(...).
    // getPropertyValue('--color-x')` siempre devuelve '' en este entorno de
    // test — se mockea para devolver el NOMBRE de la variable pedida, y así
    // poder verificar que BASIC y un tipo desconocido piden variables CSS
    // distintas (`--color-ink-muted` vs. el fallback `--color-conflict`),
    // sin depender de que el navegador real resuelva el color final.
    const getComputedStyleSpy = vi.spyOn(window, 'getComputedStyle');
    getComputedStyleSpy.mockReturnValue({
      getPropertyValue: (name: string) => name,
    } as unknown as CSSStyleDeclaration);

    const fixture = create([
      { accountType: 'BASIC', totalVolume: '100.00' },
      // Un `AccountType` hipotético (ej. "VIP", el ejemplo de Open/Closed
      // que ya usa este proyecto para las comisiones) todavía no tiene
      // entrada en CATEGORY_COLOR_VAR — el gráfico no debe romper ni
      // dejar esa barra sin color.
      { accountType: 'VIP' as unknown as 'BASIC', totalVolume: '50.00' },
    ]);

    expect(fixture.debugElement.query(By.css('canvas'))).toBeTruthy();
    const backgroundColor = (
      chartInstances[0].config.data as { datasets: { backgroundColor: string[] }[] }
    ).datasets[0].backgroundColor;
    expect(backgroundColor).toEqual(['--color-ink-muted', '--color-conflict']);

    getComputedStyleSpy.mockRestore();
  });

  it('destroys the previous chart instance before building a new one when the data input changes', () => {
    const fixture = create([{ accountType: 'BASIC', totalVolume: '100.00' }]);
    const first = chartInstances[0];

    fixture.componentRef.setInput('data', [{ accountType: 'PREMIUM', totalVolume: '200.00' }]);
    fixture.detectChanges();

    expect(first.destroy).toHaveBeenCalled();
    expect(chartInstances).toHaveLength(2);
  });

  it('destroys the chart on component destroy', () => {
    const fixture = create([{ accountType: 'BASIC', totalVolume: '100.00' }]);
    const instance = chartInstances[0];

    fixture.destroy();

    expect(instance.destroy).toHaveBeenCalled();
  });

  it('going from data back to an empty array destroys the chart and shows the empty state again', () => {
    const fixture = create([{ accountType: 'BASIC', totalVolume: '100.00' }]);
    const instance = chartInstances[0];

    fixture.componentRef.setInput('data', []);
    fixture.detectChanges();

    expect(instance.destroy).toHaveBeenCalled();
    expect(fixture.debugElement.query(By.css('canvas'))).toBeFalsy();
    expect(fixture.debugElement.query(By.css('.empty-state'))).toBeTruthy();
  });
});
