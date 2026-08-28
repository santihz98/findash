import { Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { Store } from '@ngrx/store';

import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { TransactionTableComponent } from '../../../shared/components/transaction-table/transaction-table.component';
import { myTransactionsActions } from '../../../state/myTransactions/my-transactions.actions';
import { ListMyTransactionsQuery } from '../../../state/myTransactions/my-transactions.model';
import {
  selectMyTransactions,
  selectMyTransactionsError,
  selectMyTransactionsIsInitialLoading,
  selectMyTransactionsIsRefetching,
  selectMyTransactionsPage,
  selectMyTransactionsTotalPages,
} from '../../../state/myTransactions/my-transactions.reducer';

function parseQuery(params: ParamMap): ListMyTransactionsQuery {
  const page = Number(params.get('page'));
  const limit = Number(params.get('limit'));

  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    limit: Number.isFinite(limit) && limit > 0 ? limit : 20,
  };
}

/**
 * Container "smart" (RF-02, Sesión 18 del frontend) — ruta propia
 * (`/transfer/history`, ver app.routes.ts), no una sección dentro de
 * `TransferFormPage`. Decisión documentada en PROGRESS.md: (1) el header
 * necesita un destino de navegación propio ("Historial"), no un ancla a
 * mitad de otra página; (2) mantiene `TransferFormPage` enfocado en un solo
 * trabajo (enviar dinero), sin mezclar su propio ciclo de error/loading con
 * el de un listado paginado aparte; (3) mismo patrón ya probado de
 * `AccountListPage` — la URL es la única fuente de verdad de la
 * paginación, bookmarkeable.
 *
 * Sin filtros (a diferencia de `TransactionsAuditPage`) — RF-02 no los pide
 * para la vista del CLIENT, solo para la auditoría del ADMIN.
 */
@Component({
  selector: 'app-transfer-history-page',
  imports: [TransactionTableComponent, SkeletonLoaderComponent],
  template: `
    <main class="transfer-history-page page-container">
      <h1>Historial de movimientos</h1>

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
            [showDirection]="true"
            (pageChange)="onPageChange($event)"
          />
        } @else if (!error()) {
          <p class="empty-state">Todavía no hiciste ni recibiste ninguna transferencia.</p>
        }
      }
    </main>
  `,
})
export class TransferHistoryPage {
  private readonly store = inject(Store);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });

  readonly query = computed(() => parseQuery(this.queryParams()));

  readonly transactions = this.store.selectSignal(selectMyTransactions);
  readonly page = this.store.selectSignal(selectMyTransactionsPage);
  readonly totalPages = this.store.selectSignal(selectMyTransactionsTotalPages);
  readonly error = this.store.selectSignal(selectMyTransactionsError);
  readonly isInitialLoading = this.store.selectSignal(selectMyTransactionsIsInitialLoading);
  readonly isRefetching = this.store.selectSignal(selectMyTransactionsIsRefetching);

  constructor() {
    effect(() => {
      this.store.dispatch(myTransactionsActions.loadHistory({ query: this.query() }));
    });
  }

  onPageChange(page: number): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { page }, queryParamsHandling: 'merge' });
  }

  retry(): void {
    this.store.dispatch(myTransactionsActions.loadHistory({ query: this.query() }));
  }
}
