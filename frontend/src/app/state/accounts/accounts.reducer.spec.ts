import { accountsActions } from './accounts.actions';
import { Account, AccountsState, initialAccountsState, ListAccountsResult } from './accounts.model';
import { accountsFeature, selectIsInitialLoading, selectIsRefetching } from './accounts.reducer';

const { reducer } = accountsFeature;

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

const result: ListAccountsResult = {
  data: [account],
  page: 1,
  limit: 20,
  total: 1,
  totalPages: 1,
};

describe('accountsReducer', () => {
  it('returns the initial state for an unknown action', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual(initialAccountsState);
  });

  describe('loadAccounts', () => {
    it('stores the query, sets loading true, and clears any previous error', () => {
      const previous: AccountsState = { ...initialAccountsState, error: 'boom' };
      const query = { page: 2, limit: 20, documentNumber: '101' };
      const state = reducer(previous, accountsActions.loadAccounts({ query }));

      expect(state.query).toEqual(query);
      expect(state.loading).toBe(true);
      expect(state.error).toBeNull();
    });

    it('does not clear previously loaded accounts (stale data stays visible while refetching)', () => {
      const previous: AccountsState = {
        ...initialAccountsState,
        accounts: [account],
        loaded: true,
      };
      const state = reducer(
        previous,
        accountsActions.loadAccounts({ query: { page: 1, limit: 20 } }),
      );
      expect(state.accounts).toEqual([account]);
    });
  });

  describe('loadAccountsSuccess', () => {
    it('populates accounts + pagination metadata and marks loaded', () => {
      const previous: AccountsState = { ...initialAccountsState, loading: true };
      const state = reducer(previous, accountsActions.loadAccountsSuccess({ result }));

      expect(state).toEqual({
        ...initialAccountsState,
        accounts: [account],
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        loading: false,
        loaded: true,
        error: null,
        query: initialAccountsState.query,
      });
    });
  });

  describe('loadAccountsFailure', () => {
    it('sets the error, marks loaded, and keeps whatever accounts were already there', () => {
      const previous: AccountsState = {
        ...initialAccountsState,
        accounts: [account],
        loading: true,
      };
      const state = reducer(
        previous,
        accountsActions.loadAccountsFailure({ error: 'No se pudieron cargar' }),
      );

      expect(state.error).toBe('No se pudieron cargar');
      expect(state.loading).toBe(false);
      expect(state.loaded).toBe(true);
      expect(state.accounts).toEqual([account]);
    });
  });
});

describe('accounts selectors', () => {
  it('selectIsInitialLoading is true only on the very first load (loading, never loaded before)', () => {
    expect(selectIsInitialLoading.projector(true, false)).toBe(true);
    expect(selectIsInitialLoading.projector(true, true)).toBe(false);
    expect(selectIsInitialLoading.projector(false, false)).toBe(false);
  });

  it('selectIsRefetching is true only when loading again after already having data', () => {
    expect(selectIsRefetching.projector(true, true)).toBe(true);
    expect(selectIsRefetching.projector(true, false)).toBe(false);
    expect(selectIsRefetching.projector(false, true)).toBe(false);
  });
});
