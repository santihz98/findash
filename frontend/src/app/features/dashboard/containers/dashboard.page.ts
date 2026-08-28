import { Component, inject } from '@angular/core';
import { Store } from '@ngrx/store';

import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { dashboardActions } from '../../../state/dashboard/dashboard.actions';
import {
  selectKpis,
  selectKpisError,
  selectKpisIsInitialLoading,
  selectKpisIsRefetching,
  selectVolumeByAccountType,
  selectVolumeError,
  selectVolumeIsInitialLoading,
  selectVolumeIsRefetching,
} from '../../../state/dashboard/dashboard.reducer';
import { KpiCardsComponent } from '../components/kpi-cards.component';
import { VolumeChartComponent } from '../components/volume-chart.component';

/**
 * Container "smart" (RF-07/RF-08, ADMIN-only vía `roleGuard(['ADMIN'])` en
 * `app.routes.ts`) — dispara las dos cargas independientes al entrar
 * (`loadKpis`/`loadVolumeByAccountType`, ver `dashboard.actions.ts` para
 * por qué son dos acciones separadas, no una combinada).
 *
 * **RNF-04 — doble aislamiento, no solo la ruta (tarea 1/5, criterio de
 * aceptación central):**
 * 1. La ruta `/dashboard` se registra con `loadComponent` en
 *    `app.routes.ts` — este archivo (y todo lo que importa: NgRx del
 *    feature, `KpiCardsComponent`, `VolumeChartComponent`) queda en su
 *    propio chunk, nunca en el bundle inicial. Confirmado con `ng build`
 *    real — ver PROGRESS.md para el nombre y tamaño exacto del chunk.
 * 2. Dentro de ESTE chunk, `VolumeChartComponent` (y con él, Chart.js —
 *    la librería de charting en sí, no solo el wrapper) se difiere un
 *    nivel más con `@defer (on viewport)`: ni siquiera entrar a
 *    `/dashboard` descarga Chart.js hasta que la sección del gráfico
 *    entra en el viewport. Angular solo aplica code-splitting automático
 *    a un componente si NO se usa en ningún lugar del template fuera de
 *    un bloque `@defer` — acá `VolumeChartComponent` se usa
 *    EXCLUSIVAMENTE dentro del `@defer` de abajo, así que califica.
 *
 * `@placeholder`/`@loading` reusan `SkeletonLoaderComponent` (`variant="card"`,
 * ya usado por `TransferFormPage` para el saldo) — coherente con el
 * sistema de diseño, no un "Cargando..." plano (tarea 5, explícita).
 */
@Component({
  selector: 'app-dashboard-page',
  imports: [SkeletonLoaderComponent, KpiCardsComponent, VolumeChartComponent],
  template: `
    <main class="dashboard-page page-container">
      <h1>Dashboard</h1>

      <section aria-live="polite">
        @if (kpisIsInitialLoading()) {
          <app-skeleton-loader [rows]="1" variant="card" />
        } @else {
          @if (kpisError()) {
            <div class="error-banner" role="alert">
              <p>{{ kpisError() }}</p>
              <button type="button" class="btn btn--secondary" (click)="retryKpis()">
                Reintentar
              </button>
            </div>
          }

          @if (kpis(); as k) {
            <div [class.refetching]="kpisIsRefetching()">
              <app-kpi-cards [kpis]="k" />
            </div>
          }
        }
      </section>

      <section class="dashboard-page__chart-section" aria-live="polite">
        <h2>Volumen transaccionado por tipo de cuenta</h2>

        @if (volumeIsInitialLoading()) {
          <app-skeleton-loader [rows]="1" variant="card" />
        } @else {
          @if (volumeError()) {
            <div class="error-banner" role="alert">
              <p>{{ volumeError() }}</p>
              <button type="button" class="btn btn--secondary" (click)="retryVolume()">
                Reintentar
              </button>
            </div>
          }

          <div class="dashboard-page__chart-card" [class.refetching]="volumeIsRefetching()">
            @defer (on viewport; prefetch on idle) {
              <app-volume-chart [data]="volumeByAccountType()" />
            } @placeholder {
              <app-skeleton-loader [rows]="1" variant="card" />
            } @loading (after 100ms; minimum 250ms) {
              <app-skeleton-loader [rows]="1" variant="card" />
            } @error {
              <p class="error-banner" role="alert">No se pudo cargar el gráfico.</p>
            }
          </div>
        }
      </section>
    </main>
  `,
  styles: `
    .dashboard-page__chart-section {
      margin-top: var(--space-6);
    }

    .dashboard-page__chart-section h2 {
      font-size: var(--fs-lg);
      margin-bottom: var(--space-4);
    }

    .dashboard-page__chart-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      padding: var(--space-5);
      box-shadow: var(--shadow-sm);
      transition: opacity 0.15s ease;
    }

    .dashboard-page__chart-card.refetching {
      opacity: 0.6;
    }
  `,
})
export class DashboardPage {
  private readonly store = inject(Store);

  readonly kpis = this.store.selectSignal(selectKpis);
  readonly kpisError = this.store.selectSignal(selectKpisError);
  readonly kpisIsInitialLoading = this.store.selectSignal(selectKpisIsInitialLoading);
  readonly kpisIsRefetching = this.store.selectSignal(selectKpisIsRefetching);

  readonly volumeByAccountType = this.store.selectSignal(selectVolumeByAccountType);
  readonly volumeError = this.store.selectSignal(selectVolumeError);
  readonly volumeIsInitialLoading = this.store.selectSignal(selectVolumeIsInitialLoading);
  readonly volumeIsRefetching = this.store.selectSignal(selectVolumeIsRefetching);

  constructor() {
    this.store.dispatch(dashboardActions.loadKpis());
    this.store.dispatch(dashboardActions.loadVolumeByAccountType());
  }

  retryKpis(): void {
    this.store.dispatch(dashboardActions.loadKpis());
  }

  retryVolume(): void {
    this.store.dispatch(dashboardActions.loadVolumeByAccountType());
  }
}
