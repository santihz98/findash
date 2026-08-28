import { Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { Store } from '@ngrx/store';

import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { TransactionTableComponent } from '../../../shared/components/transaction-table/transaction-table.component';
import { transactionsAuditActions } from '../../../state/transactionsAudit/transactions-audit.actions';
import {
  ListTransactionsAuditQuery,
  TransactionStatus,
} from '../../../state/transactionsAudit/transactions-audit.model';
import {
  selectAuditError,
  selectAuditIsInitialLoading,
  selectAuditIsRefetching,
  selectAuditPage,
  selectAuditTotalPages,
  selectAuditTransactions,
} from '../../../state/transactionsAudit/transactions-audit.reducer';
import {
  TransactionAuditFilters,
  TransactionAuditFiltersComponent,
} from '../components/transaction-audit-filters.component';

const VALID_STATUSES: readonly TransactionStatus[] = ['COMPLETED', 'REJECTED', 'FAILED'];

/**
 * Convierte los query params de la URL (siempre strings crudos, tal como
 * los tipeó el usuario en los filtros) a la query real que espera el
 * backend — mismo rol que `AccountListPage.parseQuery()` (Sesión 14).
 *
 * **Ajuste de "fin de día" para `dateTo` (documentar cómo se maneja el
 * caso "solo fecha, sin hora" — tarea explícita de esta sesión):** el
 * propio Swagger del backend (`GET /transactions`, ver
 * `list-transactions-query.dto.ts`) documenta que una fecha sin hora se
 * interpreta como las 00:00:00 UTC de ese día. Para `dateFrom` eso es
 * exactamente lo que un usuario espera de "desde este día" — se manda tal
 * cual. Para `dateTo`, en cambio, un usuario que elige "hasta hoy" espera
 * que HOY quede incluido — si se mandara la fecha cruda, el backend la
 * interpretaría como "hasta las 00:00:00.000 de hoy", excluyendo
 * prácticamente todo el día. Por eso, y solo para `dateTo`, se le agrega
 * `T23:59:59.999Z` antes de mandarlo — el día completo queda incluido. La
 * URL sigue guardando el valor crudo (`dateTo=2026-08-28`, legible,
 * bookmarkeable) — el ajuste ocurre acá, no en la URL ni en el servicio.
 */
function parseQuery(params: ParamMap): ListTransactionsAuditQuery {
  const page = Number(params.get('page'));
  const limit = Number(params.get('limit'));
  const status = params.get('status');
  const dateFrom = params.get('dateFrom');
  const dateTo = params.get('dateTo');

  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    limit: Number.isFinite(limit) && limit > 0 ? limit : 20,
    ...(status && (VALID_STATUSES as string[]).includes(status)
      ? { status: status as TransactionStatus }
      : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo: `${dateTo}T23:59:59.999Z` } : {}),
  };
}

/**
 * Container "smart" (RF-02, auditoría ADMIN, Sesión 18 del frontend) —
 * mismo patrón que `AccountListPage`: la URL es la única fuente de verdad
 * de filtros/paginación (bookmarkeable), `effect()` despacha el load cada
 * vez que la query parseada cambia, sin scope de cuenta (a diferencia de
 * `TransferHistoryPage`, ve TODA la plataforma).
 */
@Component({
  selector: 'app-transactions-audit-page',
  imports: [TransactionAuditFiltersComponent, TransactionTableComponent, SkeletonLoaderComponent],
  template: `
    <main class="transactions-audit-page page-container">
      <h1>Auditoría de transacciones</h1>

      <app-transaction-audit-filters
        [status]="query().status ?? ''"
        [dateFrom]="rawDateFrom()"
        [dateTo]="rawDateTo()"
        (filtersChange)="onFiltersChange($event)"
      />

      @if (isInitialLoading()) {
        <app-skeleton-loader />
      } @else {
        @if (error()) {
          <div class="error-banner" role="alert">
            <p>{{ error() }}</p>
            <button type="button" class="btn btn--secondary" (click)="retry()">Reintentar</button>
          </div>
        }

        @if (transactions().length > 0) {
          <app-transaction-table
            [transactions]="transactions()"
            [page]="page()"
            [totalPages]="totalPages()"
            [refetching]="isRefetching()"
            (pageChange)="onPageChange($event)"
          />
        } @else if (!error()) {
          <p class="empty-state">No se encontraron transacciones con los filtros aplicados.</p>
        }
      }
    </main>
  `,
})
export class TransactionsAuditPage {
  private readonly store = inject(Store);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });

  readonly query = computed(() => parseQuery(this.queryParams()));
  /** Valores crudos (sin el ajuste de fin de día) para repoblar el formulario de filtros tal como el usuario los tipeó. */
  readonly rawDateFrom = computed(() => this.queryParams().get('dateFrom') ?? '');
  readonly rawDateTo = computed(() => this.queryParams().get('dateTo') ?? '');

  readonly transactions = this.store.selectSignal(selectAuditTransactions);
  readonly page = this.store.selectSignal(selectAuditPage);
  readonly totalPages = this.store.selectSignal(selectAuditTotalPages);
  readonly error = this.store.selectSignal(selectAuditError);
  readonly isInitialLoading = this.store.selectSignal(selectAuditIsInitialLoading);
  readonly isRefetching = this.store.selectSignal(selectAuditIsRefetching);

  constructor() {
    effect(() => {
      this.store.dispatch(transactionsAuditActions.loadTransactions({ query: this.query() }));
    });
  }

  onFiltersChange(filters: TransactionAuditFilters): void {
    this.navigate({
      status: filters.status || null,
      dateFrom: filters.dateFrom || null,
      dateTo: filters.dateTo || null,
      page: 1,
    });
  }

  onPageChange(page: number): void {
    this.navigate({ page });
  }

  retry(): void {
    this.store.dispatch(transactionsAuditActions.loadTransactions({ query: this.query() }));
  }

  private navigate(queryParams: Record<string, string | number | null>): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
    });
  }
}
