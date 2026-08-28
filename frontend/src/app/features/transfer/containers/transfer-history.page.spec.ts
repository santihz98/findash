import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { By } from '@angular/platform-browser';
import { Store } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { BehaviorSubject } from 'rxjs';

import { myTransactionsActions } from '../../../state/myTransactions/my-transactions.actions';
import { MyTransaction, initialMyTransactionsState } from '../../../state/myTransactions/my-transactions.model';
import { TransferHistoryPage } from './transfer-history.page';

const transaction: MyTransaction = {
  id: 'tx-1',
  originAccountId: 'acc-1',
  destAccountId: 'acc-2',
  amount: '100.00',
  commission: '2.00',
  authorizationCode: 'ABC123',
  status: 'COMPLETED',
  createdAt: '2026-08-28T00:00:00.000Z',
  direction: 'SENT',
};

function create(queryParams: Record<string, string> = {}, autoDetect = true) {
  const queryParamMap$ = new BehaviorSubject(convertToParamMap(queryParams));
  const navigateSpy = vi.fn();

  TestBed.configureTestingModule({
    providers: [
      provideMockStore({ initialState: { myTransactions: initialMyTransactionsState } }),
      { provide: ActivatedRoute, useValue: { queryParamMap: queryParamMap$ } },
      { provide: Router, useValue: { navigate: navigateSpy } },
    ],
  });

  const store = TestBed.inject(Store) as MockStore;
  const fixture = TestBed.createComponent(TransferHistoryPage);
  if (autoDetect) {
    fixture.detectChanges();
  }

  return { fixture, store, navigateSpy };
}

describe('TransferHistoryPage', () => {
  it('dispatches loadHistory with the query parsed from the URL on init', () => {
    const { fixture, store } = create({ page: '2', limit: '10' }, false);
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    fixture.detectChanges();

    expect(dispatchSpy).toHaveBeenCalledWith(
      myTransactionsActions.loadHistory({ query: { page: 2, limit: 10 } }),
    );
  });

  it('defaults to page 1 / limit 20 when the URL has no query params', () => {
    const { fixture, store } = create({}, false);
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    fixture.detectChanges();

    expect(dispatchSpy).toHaveBeenCalledWith(
      myTransactionsActions.loadHistory({ query: { page: 1, limit: 20 } }),
    );
  });

  it('shows the skeleton loader while isInitialLoading is true', () => {
    const { fixture, store } = create();
    store.setState({ myTransactions: { ...initialMyTransactionsState, loading: true, loaded: false } });
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('app-skeleton-loader'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('app-transaction-table'))).toBeFalsy();
  });

  it('shows the error banner with a retry button when loading fails (e.g. 422 NoOriginAccountException)', () => {
    const { fixture, store } = create();
    store.setState({
      myTransactions: {
        ...initialMyTransactionsState,
        loading: false,
        loaded: true,
        error: 'No se encontró una única cuenta de origen para este usuario',
      },
    });
    fixture.detectChanges();

    const banner = fixture.debugElement.query(By.css('.error-banner'));
    expect(banner.nativeElement.textContent).toContain(
      'No se encontró una única cuenta de origen para este usuario',
    );
    expect(banner.query(By.css('button'))).toBeTruthy();
    // La página no se rompe: sigue montada, sin tabla (nada que mostrar).
    expect(fixture.debugElement.query(By.css('app-transaction-table'))).toBeFalsy();
  });

  it('shows a clear empty-state message when there are no results and no error', () => {
    const { fixture, store } = create();
    store.setState({
      myTransactions: { ...initialMyTransactionsState, loading: false, loaded: true, transactions: [] },
    });
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.empty-state')).nativeElement.textContent).toContain(
      'Todavía no hiciste ni recibiste ninguna transferencia',
    );
  });

  it('renders the table with showDirection=true when there are transactions', () => {
    const { fixture, store } = create();
    store.setState({
      myTransactions: {
        ...initialMyTransactionsState,
        loading: false,
        loaded: true,
        transactions: [transaction],
        totalPages: 1,
      },
    });
    fixture.detectChanges();

    const table = fixture.debugElement.query(By.css('app-transaction-table'));
    expect(table).toBeTruthy();
    expect(table.componentInstance.showDirection()).toBe(true);
  });

  it('marks the table as refetching while a refetch is in flight (stale data stays visible)', () => {
    const { fixture, store } = create();
    store.setState({
      myTransactions: {
        ...initialMyTransactionsState,
        loading: true,
        loaded: true,
        transactions: [transaction],
        totalPages: 1,
      },
    });
    fixture.detectChanges();

    const table = fixture.debugElement.query(By.css('app-transaction-table'));
    expect(table.componentInstance.refetching()).toBe(true);
  });

  it('onPageChange navigates with just the new page merged in', () => {
    const { fixture, navigateSpy } = create();
    navigateSpy.mockClear();

    fixture.componentInstance.onPageChange(3);

    expect(navigateSpy).toHaveBeenCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: { page: 3 },
      queryParamsHandling: 'merge',
    });
  });

  it('retry() re-dispatches loadHistory with the current query', () => {
    const { fixture, store } = create({ page: '2', limit: '20' });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    dispatchSpy.mockClear();

    fixture.componentInstance.retry();

    expect(dispatchSpy).toHaveBeenCalledWith(
      myTransactionsActions.loadHistory({ query: { page: 2, limit: 20 } }),
    );
  });
});
