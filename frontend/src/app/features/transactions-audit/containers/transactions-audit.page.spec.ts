import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { By } from '@angular/platform-browser';
import { Store } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { BehaviorSubject } from 'rxjs';

import { transactionsAuditActions } from '../../../state/transactionsAudit/transactions-audit.actions';
import {
  AuditTransaction,
  initialTransactionsAuditState,
} from '../../../state/transactionsAudit/transactions-audit.model';
import { TransactionsAuditPage } from './transactions-audit.page';

const transaction: AuditTransaction = {
  id: 'tx-1',
  originAccountId: 'acc-1',
  destAccountId: 'acc-2',
  amount: '100.00',
  commission: '2.00',
  authorizationCode: 'ABC123',
  status: 'COMPLETED',
  createdAt: '2026-08-28T00:00:00.000Z',
  originAccount: { accountNumber: '1000000001', accountType: 'BASIC', ownerEmail: 'basic@findash.dev', ownerDocumentNumber: '1010000002' },
  destAccount: { accountNumber: '1000000002', accountType: 'PREMIUM', ownerEmail: 'premium@findash.dev', ownerDocumentNumber: '1010000003' },
};

function create(queryParams: Record<string, string> = {}, autoDetect = true) {
  const queryParamMap$ = new BehaviorSubject(convertToParamMap(queryParams));
  const navigateSpy = vi.fn();

  TestBed.configureTestingModule({
    providers: [
      provideMockStore({ initialState: { transactionsAudit: initialTransactionsAuditState } }),
      { provide: ActivatedRoute, useValue: { queryParamMap: queryParamMap$ } },
      { provide: Router, useValue: { navigate: navigateSpy } },
    ],
  });

  const store = TestBed.inject(Store) as MockStore;
  const fixture = TestBed.createComponent(TransactionsAuditPage);
  if (autoDetect) {
    fixture.detectChanges();
  }

  return { fixture, store, navigateSpy };
}

describe('TransactionsAuditPage', () => {
  it('dispatches loadTransactions with page/limit parsed from the URL on init', () => {
    const { fixture, store } = create({ page: '2', limit: '10' }, false);
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    fixture.detectChanges();

    expect(dispatchSpy).toHaveBeenCalledWith(
      transactionsAuditActions.loadTransactions({ query: { page: 2, limit: 10 } }),
    );
  });

  it('defaults to page 1 / limit 20 with no filters when the URL has no query params', () => {
    const { fixture, store } = create({}, false);
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    fixture.detectChanges();

    expect(dispatchSpy).toHaveBeenCalledWith(
      transactionsAuditActions.loadTransactions({ query: { page: 1, limit: 20 } }),
    );
  });

  it('parses a valid status from the URL into the query', () => {
    const { fixture, store } = create({ status: 'REJECTED' }, false);
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    fixture.detectChanges();

    expect(dispatchSpy).toHaveBeenCalledWith(
      transactionsAuditActions.loadTransactions({ query: { page: 1, limit: 20, status: 'REJECTED' } }),
    );
  });

  it('ignores an invalid status value from the URL (defense in depth against a hand-edited URL)', () => {
    const { fixture, store } = create({ status: 'NOT_A_REAL_STATUS' }, false);
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    fixture.detectChanges();

    expect(dispatchSpy).toHaveBeenCalledWith(
      transactionsAuditActions.loadTransactions({ query: { page: 1, limit: 20 } }),
    );
  });

  it('sends dateFrom as-is (backend interprets a bare date as 00:00:00 UTC of that day)', () => {
    const { fixture, store } = create({ dateFrom: '2026-08-01' }, false);
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    fixture.detectChanges();

    expect(dispatchSpy).toHaveBeenCalledWith(
      transactionsAuditActions.loadTransactions({
        query: { page: 1, limit: 20, dateFrom: '2026-08-01' },
      }),
    );
  });

  it('appends end-of-day to dateTo so the selected day is fully included (tarea explícita: "solo fecha, sin hora")', () => {
    const { fixture, store } = create({ dateTo: '2026-08-28' }, false);
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    fixture.detectChanges();

    expect(dispatchSpy).toHaveBeenCalledWith(
      transactionsAuditActions.loadTransactions({
        query: { page: 1, limit: 20, dateTo: '2026-08-28T23:59:59.999Z' },
      }),
    );
  });

  it('combines status + dateFrom + dateTo filters in a single query', () => {
    const { fixture, store } = create(
      { status: 'FAILED', dateFrom: '2026-08-01', dateTo: '2026-08-28' },
      false,
    );
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    fixture.detectChanges();

    expect(dispatchSpy).toHaveBeenCalledWith(
      transactionsAuditActions.loadTransactions({
        query: {
          page: 1,
          limit: 20,
          status: 'FAILED',
          dateFrom: '2026-08-01',
          dateTo: '2026-08-28T23:59:59.999Z',
        },
      }),
    );
  });

  it('repopulates the filters form with the RAW dateTo from the URL, not the end-of-day-adjusted value', () => {
    const { fixture } = create({ dateTo: '2026-08-28' });

    const filters = fixture.debugElement.query(By.css('app-transaction-audit-filters'));
    expect(filters.componentInstance.dateTo()).toBe('2026-08-28');
  });

  it('shows the skeleton loader while isInitialLoading is true', () => {
    const { fixture, store } = create();
    store.setState({
      transactionsAudit: { ...initialTransactionsAuditState, loading: true, loaded: false },
    });
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('app-skeleton-loader'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('app-transaction-table'))).toBeFalsy();
  });

  it('shows the error banner with a retry button when loading fails (e.g. CLIENT gets 403)', () => {
    const { fixture, store } = create();
    store.setState({
      transactionsAudit: {
        ...initialTransactionsAuditState,
        loading: false,
        loaded: true,
        error: 'Forbidden resource',
      },
    });
    fixture.detectChanges();

    const banner = fixture.debugElement.query(By.css('.error-banner'));
    expect(banner.nativeElement.textContent).toContain('Forbidden resource');
    expect(banner.query(By.css('button'))).toBeTruthy();
  });

  it('shows a clear empty-state message when there are no results and no error', () => {
    const { fixture, store } = create();
    store.setState({
      transactionsAudit: {
        ...initialTransactionsAuditState,
        loading: false,
        loaded: true,
        transactions: [],
      },
    });
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.empty-state')).nativeElement.textContent).toContain(
      'No se encontraron transacciones',
    );
  });

  it('renders the table without direction (showDirection=false) when there are transactions', () => {
    const { fixture, store } = create();
    store.setState({
      transactionsAudit: {
        ...initialTransactionsAuditState,
        loading: false,
        loaded: true,
        transactions: [transaction],
        totalPages: 1,
      },
    });
    fixture.detectChanges();

    const table = fixture.debugElement.query(By.css('app-transaction-table'));
    expect(table).toBeTruthy();
    expect(table.componentInstance.showDirection()).toBe(false);
  });

  it('onFiltersChange navigates merging status/dateFrom/dateTo and resetting to page 1', () => {
    const { fixture, navigateSpy } = create({ page: '3' });
    navigateSpy.mockClear();

    fixture.componentInstance.onFiltersChange({
      status: 'COMPLETED',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-28',
    });

    expect(navigateSpy).toHaveBeenCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: { status: 'COMPLETED', dateFrom: '2026-08-01', dateTo: '2026-08-28', page: 1 },
      queryParamsHandling: 'merge',
    });
  });

  it('onFiltersChange clears filters from the URL when they are emptied', () => {
    const { fixture, navigateSpy } = create();
    navigateSpy.mockClear();

    fixture.componentInstance.onFiltersChange({ status: '', dateFrom: '', dateTo: '' });

    expect(navigateSpy).toHaveBeenCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: { status: null, dateFrom: null, dateTo: null, page: 1 },
      queryParamsHandling: 'merge',
    });
  });

  it('onPageChange navigates with just the new page merged in', () => {
    const { fixture, navigateSpy } = create();
    navigateSpy.mockClear();

    fixture.componentInstance.onPageChange(4);

    expect(navigateSpy).toHaveBeenCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: { page: 4 },
      queryParamsHandling: 'merge',
    });
  });

  it('retry() re-dispatches loadTransactions with the current (already-parsed) query', () => {
    const { fixture, store } = create({ page: '2', limit: '20', status: 'REJECTED' });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    dispatchSpy.mockClear();

    fixture.componentInstance.retry();

    expect(dispatchSpy).toHaveBeenCalledWith(
      transactionsAuditActions.loadTransactions({
        query: { page: 2, limit: 20, status: 'REJECTED' },
      }),
    );
  });
});
