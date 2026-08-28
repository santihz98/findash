import { Component, ElementRef, OnDestroy, computed, effect, inject, input, viewChild } from '@angular/core';

import { AccountTypeVolume } from '../../../state/dashboard/dashboard.model';
import { ChartJsRendererService } from '../services/chart-js-renderer.service';
import { CHART_RENDERER } from '../services/chart-renderer.token';

/**
 * Mismo mapeo de color por `accountType` ya establecido en
 * `AccountTableComponent` (Sesión 16): BASIC neutro, PREMIUM el rojo de
 * marca, CORPORATE azul info — el gráfico usa literalmente los mismos 3
 * colores que ya identifican a cada tipo de cuenta en la tabla de
 * `/accounts`, en vez de inventar una paleta categórica nueva para este
 * chart. `FALLBACK_COLOR_VAR` cubre un `AccountType` futuro (ej. "VIP",
 * el ejemplo de Open/Closed que ya usa este proyecto para las comisiones,
 * ARCHITECTURE.md 3.1) sin que el gráfico rompa ni le falte color a esa
 * barra — consistente con la Decisión de la tarea 6 de no acoplar este
 * componente a la lista actual de 3 tipos.
 */
const CATEGORY_COLOR_VAR: Record<string, string> = {
  BASIC: '--color-ink-muted',
  PREMIUM: '--color-primary',
  CORPORATE: '--color-info',
};
const FALLBACK_COLOR_VAR = '--color-conflict';

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * **Decisión — datos parciales: se omite el tipo ausente, nunca se rellena
 * con `totalVolume: '0.00'` (tarea 6, explícita a documentar).** El
 * backend ya decidió (Sesión 7 del backend) no enumerar los 3 `AccountType`
 * a mano para no acoplar la query a la lista actual del enum — es
 * literalmente el mismo argumento de Open/Closed que justifica la
 * Strategy+Factory de comisiones (ARCHITECTURE.md 3.1). Si este componente
 * "completara" el hueco enumerando BASIC/PREMIUM/CORPORATE a mano acá,
 * reintroduciría exactamente el acoplamiento que el backend evitó a
 * propósito: el día que se agregue un 4to tipo de cuenta, el backend ya
 * funciona solo (nueva Strategy + un `case` en el factory), pero este
 * componente hardcodeado nunca mostraría esa barra nueva aunque los datos
 * ya estén ahí. En vez de eso, el gráfico renderiza EXACTAMENTE lo que
 * llega — ni más ni menos — y la ausencia se explica con una leyenda
 * (`.volume-chart__caption`) para que no se lea como un bug ("¿por qué no
 * aparece CORPORATE?") sino como el comportamiento esperado.
 *
 * **Array completamente vacío (tarea 7):** mensaje explícito
 * (`.empty-state`, misma clase que el resto de la app) en vez de montar un
 * `<canvas>` con Chart.js sobre cero datos — eso se ve roto/en blanco, no
 * "sin datos todavía".
 */
@Component({
  selector: 'app-volume-chart',
  // Proveído a nivel de ESTE componente (no en app.config.ts, la raíz) a
  // propósito: `ChartJsRendererService` es la única pieza de todo el
  // proyecto que importa `chart.js` de verdad — declararla acá hace que
  // termine en el MISMO chunk diferido que este propio componente (ver
  // dashboard.page.ts, el `@defer` que lo carga), preservando el doble
  // aislamiento de RNF-04. Si se proveyera en la raíz, `chart.js` viajaría
  // en el bundle inicial sin importar cuántos `@defer` tenga el template.
  // En tests, se reemplaza vía `TestBed.overrideComponent` (DI de
  // Angular, no `vi.mock` de módulos — ver chart-renderer.token.ts).
  providers: [{ provide: CHART_RENDERER, useClass: ChartJsRendererService }],
  template: `
    @if (data().length === 0) {
      <p class="empty-state">Todavía no hay transferencias completadas para graficar.</p>
    } @else {
      <canvas #canvas role="img" [attr.aria-label]="ariaLabel()"></canvas>
      @if (isPartial()) {
        <p class="volume-chart__caption">
          Solo se muestran los tipos de cuenta con transferencias completadas.
        </p>
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }

    canvas {
      max-height: 320px;
    }

    .volume-chart__caption {
      margin-top: var(--space-3);
      font-size: var(--fs-sm);
      color: var(--color-ink-muted);
      text-align: center;
    }
  `,
})
export class VolumeChartComponent implements OnDestroy {
  data = input.required<AccountTypeVolume[]>();

  private readonly chartRenderer = inject(CHART_RENDERER);
  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private chart: { destroy(): void } | null = null;

  /** Conocidos hoy — solo para decidir si mostrar la leyenda de "parcial", nunca para completar el gráfico (ver comentario de arriba). */
  private static readonly KNOWN_TYPES_COUNT = Object.keys(CATEGORY_COLOR_VAR).length;
  readonly isPartial = computed(() => this.data().length < VolumeChartComponent.KNOWN_TYPES_COUNT);

  constructor() {
    effect(() => {
      const rows = this.data();
      const canvas = this.canvasRef();
      if (!canvas) {
        return;
      }
      this.render(rows, canvas.nativeElement);
    });
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  ariaLabel(): string {
    return this.data()
      .map((row) => `${row.accountType}: ${row.totalVolume}`)
      .join(', ');
  }

  private render(rows: AccountTypeVolume[], canvas: HTMLCanvasElement): void {
    this.chart?.destroy();
    if (rows.length === 0) {
      return;
    }
    this.chart = this.chartRenderer.render(canvas, {
      type: 'bar',
      data: {
        labels: rows.map((row) => row.accountType),
        datasets: [
          {
            label: 'Volumen transaccionado',
            data: rows.map((row) => Number(row.totalVolume)),
            backgroundColor: rows.map((row) =>
              cssVar(CATEGORY_COLOR_VAR[row.accountType] ?? FALLBACK_COLOR_VAR),
            ),
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } },
      },
    });
  }
}
