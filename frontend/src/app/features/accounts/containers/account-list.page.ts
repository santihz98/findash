import { Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { Store } from '@ngrx/store';

import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { accountsActions } from '../../../state/accounts/accounts.actions';
import { AccountStatus, ListAccountsQuery } from '../../../state/accounts/accounts.model';
import {
  selectAccounts,
  selectAccountsError,
  selectIsInitialLoading,
  selectIsRefetching,
  selectPage,
  selectTotalPages,
} from '../../../state/accounts/accounts.reducer';
import { AccountFilters, AccountFiltersComponent } from '../components/account-filters.component';
import { AccountTableComponent } from '../components/account-table.component';

function parseQuery(params: ParamMap): ListAccountsQuery {
  const page = Number(params.get('page'));
  const limit = Number(params.get('limit'));
  const documentNumber = params.get('documentNumber');
  const status = params.get('status') as AccountStatus | null;

  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    limit: Number.isFinite(limit) && limit > 0 ? limit : 20,
    ...(documentNumber ? { documentNumber } : {}),
    ...(status === 'ACTIVE' || status === 'BLOCKED' ? { status } : {}),
  };
}

/**
 * Container "smart" (RF-03/RF-04, ARCHITECTURE.md sección 4): la URL es la
 * única fuente de verdad de filtros/paginación — no un `signal`/estado
 * interno aparte — para que sea bookmarkeable/compartible (tarea 2). El
 * flujo es unidireccional: filtro/página cambia -> `router.navigate` con
 * `queryParamsHandling: 'merge'` -> `queryParamMap` emite -> el `effect()`
 * de abajo despacha `loadAccounts` con la query ya parseada. Ningún
 * handler despacha directo al Store.
 */
@Component({
  selector: 'app-account-list-page',
  imports: [AccountFiltersComponent, AccountTableComponent, SkeletonLoaderComponent],
  template: `
    <main class="account-list-page page-container">
      <h1>Cuentas</h1>

      <app-account-filters
        [documentNumber]="query().documentNumber ?? ''"
        [status]="query().status ?? ''"
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

        @if (accounts().length > 0) {
          <app-account-table
            [accounts]="accounts()"
            [page]="page()"
            [totalPages]="totalPages()"
            [refetching]="isRefetching()"
            (pageChange)="onPageChange($event)"
          />
        } @else if (!error()) {
          <p class="empty-state">No se encontraron cuentas con los filtros aplicados.</p>
        }
      }
    </main>
  `,
})
export class AccountListPage {
  private readonly store = inject(Store);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });

  readonly query = computed(() => parseQuery(this.queryParams()));

  readonly accounts = this.store.selectSignal(selectAccounts);
  readonly page = this.store.selectSignal(selectPage);
  readonly totalPages = this.store.selectSignal(selectTotalPages);
  readonly error = this.store.selectSignal(selectAccountsError);
  readonly isInitialLoading = this.store.selectSignal(selectIsInitialLoading);
  readonly isRefetching = this.store.selectSignal(selectIsRefetching);

  constructor() {
    effect(() => {
      this.store.dispatch(accountsActions.loadAccounts({ query: this.query() }));
    });
  }

  onFiltersChange(filters: AccountFilters): void {
    this.navigate({
      documentNumber: filters.documentNumber || null,
      status: filters.status || null,
      page: 1,
    });
  }

  onPageChange(page: number): void {
    this.navigate({ page });
  }

  retry(): void {
    this.store.dispatch(accountsActions.loadAccounts({ query: this.query() }));
  }

  private navigate(queryParams: Record<string, string | number | null>): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
    });
  }
}
