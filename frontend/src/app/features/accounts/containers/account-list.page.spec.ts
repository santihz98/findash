import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { By } from '@angular/platform-browser';
import { Store } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { BehaviorSubject } from 'rxjs';

import { accountsActions } from '../../../state/accounts/accounts.actions';
import { Account, initialAccountsState } from '../../../state/accounts/accounts.model';
import { AccountListPage } from './account-list.page';

const account: Account = {
  id: 'acc-1',
  accountNumber: '1000000001',
  balance: '979.60',
  accountType: 'BASIC',
  status: 'ACTIVE',
  avatarUrl: null,
  documentNumber: '1010000002',
  email: 'basic@findash.dev',
};

function create(queryParams: Record<string, string> = {}, autoDetect = true) {
  const queryParamMap$ = new BehaviorSubject(convertToParamMap(queryParams));
  const navigateSpy = vi.fn();

  TestBed.configureTestingModule({
    providers: [
      provideMockStore({ initialState: { accounts: initialAccountsState } }),
      { provide: ActivatedRoute, useValue: { queryParamMap: queryParamMap$ } },
      { provide: Router, useValue: { navigate: navigateSpy } },
    ],
  });

  const store = TestBed.inject(Store) as MockStore;
  const fixture = TestBed.createComponent(AccountListPage);
  if (autoDetect) {
    fixture.detectChanges();
  }

  return { fixture, store, navigateSpy };
}

describe('AccountListPage', () => {
  it('dispatches loadAccounts with the query parsed from the URL on init (tarea 2)', () => {
    const { fixture, store } = create(
      { page: '2', limit: '20', documentNumber: '101', status: 'ACTIVE' },
      false,
    );
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    fixture.detectChanges();

    expect(dispatchSpy).toHaveBeenCalledWith(
      accountsActions.loadAccounts({
        query: { page: 2, limit: 20, documentNumber: '101', status: 'ACTIVE' },
      }),
    );
  });

  it('defaults to page 1 / limit 20 when the URL has no query params', () => {
    const { fixture, store } = create({}, false);
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    fixture.detectChanges();

    expect(dispatchSpy).toHaveBeenCalledWith(
      accountsActions.loadAccounts({ query: { page: 1, limit: 20 } }),
    );
  });

  it('shows the skeleton loader while isInitialLoading is true', () => {
    const { fixture, store } = create();
    store.setState({ accounts: { ...initialAccountsState, loading: true, loaded: false } });
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('app-skeleton-loader'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('app-account-table'))).toBeFalsy();
  });

  it('shows the error banner with a retry button when loading fails', () => {
    const { fixture, store } = create();
    store.setState({
      accounts: {
        ...initialAccountsState,
        loading: false,
        loaded: true,
        error: 'No se pudieron cargar las cuentas.',
      },
    });
    fixture.detectChanges();

    const banner = fixture.debugElement.query(By.css('.error-banner'));
    expect(banner.nativeElement.textContent).toContain('No se pudieron cargar las cuentas.');
    expect(banner.query(By.css('button'))).toBeTruthy();
  });

  it('shows a clear empty-state message when there are no results and no error (not a blank table)', () => {
    const { fixture, store } = create();
    store.setState({
      accounts: { ...initialAccountsState, loading: false, loaded: true, accounts: [] },
    });
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.empty-state')).nativeElement.textContent).toContain(
      'No se encontraron cuentas',
    );
    expect(fixture.debugElement.query(By.css('app-account-table'))).toBeFalsy();
  });

  it('shows the table when there are accounts, marked as refetching if a refetch is in flight', () => {
    const { fixture, store } = create();
    store.setState({
      accounts: {
        ...initialAccountsState,
        loading: true,
        loaded: true,
        accounts: [account],
        totalPages: 1,
      },
    });
    fixture.detectChanges();

    const table = fixture.debugElement.query(By.css('app-account-table'));
    expect(table).toBeTruthy();
    expect(table.componentInstance.refetching()).toBe(true);
  });

  it('shows both the stale table AND the error banner when a refetch fails but old data is still there', () => {
    const { fixture, store } = create();
    store.setState({
      accounts: {
        ...initialAccountsState,
        loading: false,
        loaded: true,
        accounts: [account],
        totalPages: 1,
        error: 'No se pudieron cargar las cuentas.',
      },
    });
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('app-account-table'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('.error-banner'))).toBeTruthy();
  });

  it('onFiltersChange navigates merging documentNumber/status and resetting to page 1', () => {
    const { fixture, navigateSpy } = create({ page: '3' });
    navigateSpy.mockClear();

    fixture.componentInstance.onFiltersChange({ documentNumber: '1010000', status: 'ACTIVE' });

    expect(navigateSpy).toHaveBeenCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: { documentNumber: '1010000', status: 'ACTIVE', page: 1 },
      queryParamsHandling: 'merge',
    });
  });

  it('onFiltersChange clears documentNumber/status from the URL when they are emptied', () => {
    const { fixture, navigateSpy } = create();
    navigateSpy.mockClear();

    fixture.componentInstance.onFiltersChange({ documentNumber: '', status: '' });

    expect(navigateSpy).toHaveBeenCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: { documentNumber: null, status: null, page: 1 },
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

  it('retry() re-dispatches loadAccounts with the current query', () => {
    const { fixture, store } = create({ page: '2', limit: '20' });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    dispatchSpy.mockClear();

    fixture.componentInstance.retry();

    expect(dispatchSpy).toHaveBeenCalledWith(
      accountsActions.loadAccounts({ query: { page: 2, limit: 20 } }),
    );
  });
});
