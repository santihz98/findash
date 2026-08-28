import { InjectionToken } from '@angular/core';
import type { ChartConfiguration } from 'chart.js';

/**
 * Puerto (mismo espíritu que los `ports`/interfaces del backend, ver
 * ARCHITECTURE.md sección 3) que aísla a `VolumeChartComponent` de
 * Chart.js como implementación concreta. Sin este puerto, el componente
 * importaría `chart.js` directo — y `chart.js` es real trabajo hecho al
 * importar el módulo (`Chart.register(...)` corre en el top-level del
 * archivo), no algo que un simple `vi.mock` por-archivo pueda aislar de
 * forma confiable bajo el test runner de este proyecto (`@angular/build:
 * unit-test` corre con `isolate: false` — confirmado leyendo su código
 * fuente — así que todos los archivos de test de un mismo worker
 * comparten un único registro de módulos; un mock de un módulo de
 * terceros declarado en un archivo puede perder la carrera contra el
 * `chart.js` real si otro archivo del mismo worker lo importa primero).
 *
 * La solución real, no un parche: que `VolumeChartComponent` dependa de
 * este `InjectionToken` (una interfaz pura, sin importar nunca `chart.js`
 * ni la implementación concreta) — los tests reemplazan la implementación
 * vía el propio mecanismo de DI de Angular (`TestBed`, que sí se resetea
 * de forma confiable entre tests, a diferencia del registro de módulos de
 * Vitest bajo `isolate: false`), nunca mockeando el módulo `chart.js` en
 * sí. Solo `chart-js-renderer.service.ts` (la implementación real,
 * cableada en `app.config.ts`) importa `chart.js` de verdad — ningún
 * archivo de test necesita importar ese archivo jamás.
 */
export interface IChartRenderer {
  render(canvas: HTMLCanvasElement, config: ChartConfiguration<'bar'>): { destroy(): void };
}

export const CHART_RENDERER = new InjectionToken<IChartRenderer>('CHART_RENDERER');
