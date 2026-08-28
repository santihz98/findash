import { Injectable } from '@angular/core';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  Tooltip,
  type ChartConfiguration,
} from 'chart.js';

import { IChartRenderer } from './chart-renderer.token';

// Registro explícito y mínimo (no `registerables`, el registro completo de
// Chart.js) — este proyecto solo necesita un bar chart simple, registrar
// todo el catálogo de charts/escalas/plugins que nunca se usan es peso de
// bundle regalado sin ningún beneficio.
Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

/**
 * Única implementación real del puerto `IChartRenderer` — el único
 * archivo de todo el proyecto que importa `chart.js` de verdad. Cableado
 * en `app.config.ts`, nunca importado por ningún test (ver
 * `chart-renderer.token.ts` para el porqué).
 */
@Injectable()
export class ChartJsRendererService implements IChartRenderer {
  render(canvas: HTMLCanvasElement, config: ChartConfiguration<'bar'>): { destroy(): void } {
    return new Chart(canvas, config);
  }
}
