import { Component, input } from '@angular/core';

import { DashboardKpis } from '../../../state/dashboard/dashboard.model';

/**
 * "Dumb" (RNF-03): recibe los KPIs ya resueltos por el container, nunca
 * toca el Store ni HttpClient. `totalVolumeTransacted` se muestra tal cual
 * lo formatea el backend (ya viene con 2 decimales, ej. `"434.00"`) — sin
 * `$` ni ningún símbolo de moneda agregado, mismo criterio que ya usa el
 * resto de la app para montos (`.balance-card__balance` en
 * `TransferFormPage`, `.account-table__balance`): en ningún otro lugar de
 * FinDash se antepone un símbolo de moneda, así que hacerlo acá por
 * primera vez habría sido una inconsistencia visual nueva, no un acierto.
 * Mismo tratamiento visual grande/negrita/tabular-nums que el saldo de
 * `TransferFormPage` (tarea 4, explícita).
 */
@Component({
  selector: 'app-kpi-cards',
  template: `
    <div class="kpi-cards">
      <div class="kpi-card kpi-card--primary">
        <p class="kpi-card__label">Volumen total transaccionado</p>
        <p class="kpi-card__value">{{ kpis().totalVolumeTransacted }}</p>
        <p class="kpi-card__hint">Solo transferencias completadas (COMPLETED)</p>
      </div>
      <div class="kpi-card kpi-card--danger">
        <p class="kpi-card__label">Transferencias fallidas o rechazadas</p>
        <p class="kpi-card__value">{{ kpis().failedOrRejectedCount }}</p>
        <p class="kpi-card__hint">Rechazadas por regla de negocio + fallas técnicas (RN-02)</p>
      </div>
    </div>
  `,
  styles: `
    .kpi-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: var(--space-4);
    }

    .kpi-card {
      border-radius: var(--radius-lg);
      padding: var(--space-5);
      box-shadow: var(--shadow-sm);
    }

    .kpi-card--primary {
      background: linear-gradient(135deg, var(--color-primary), var(--color-primary-active));
      color: var(--color-primary-contrast);
    }

    .kpi-card--danger {
      background: var(--color-surface);
      border: 1px solid var(--color-danger-soft-border);
    }

    .kpi-card__label {
      font-size: var(--fs-sm);
      font-weight: 600;
      opacity: 0.85;
      margin-bottom: var(--space-2);
    }

    .kpi-card--danger .kpi-card__label {
      opacity: 1;
      color: var(--color-ink-muted);
    }

    .kpi-card__value {
      font-size: 2.5rem;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.02em;
    }

    .kpi-card--danger .kpi-card__value {
      color: var(--color-danger);
    }

    .kpi-card__hint {
      font-size: var(--fs-sm);
      margin-top: var(--space-2);
      opacity: 0.75;
    }

    .kpi-card--danger .kpi-card__hint {
      color: var(--color-ink-muted);
      opacity: 1;
    }
  `,
})
export class KpiCardsComponent {
  kpis = input.required<DashboardKpis>();
}
