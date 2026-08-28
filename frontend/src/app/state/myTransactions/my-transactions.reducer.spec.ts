import { myTransactionsActions } from './my-transactions.actions';
import {
  ListMyTransactionsResult,
  MyTransaction,
  MyTransactionsState,
  initialMyTransactionsState,
} from './my-transactions.model';
import {
  myTransactionsFeature,
  selectMyTransactionsIsInitialLoading as selectIsInitialLoading,
  selectMyTransactionsIsRefetching as selectIsRefetching,
} from './my-transactions.reducer';

const { reducer } = myTransactionsFeature;

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
  counterpartyAccount: { accountNumber: '1000000002', accountType: 'PREMIUM' },
};

const result: ListMyTransactionsResult = {
  data: [transaction],
  page: 1,
  limit: 20,
  total: 1,
  totalPages: 1,
};

describe('myTransactionsReducer', () => {
  it('returns the initial state for an unknown action', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual(initialMyTransactionsState);
  });

  describe('loadHistory', () => {
    it('stores the query, sets loading true, and clears any previous error', () => {
      const previous: MyTransactionsState = { ...initialMyTransactionsState, error: 'boom' };
      const query = { page: 2, limit: 20 };
      const state = reducer(previous, myTransactionsActions.loadHistory({ query }));

      expect(state.query).toEqual(query);
      expect(state.loading).toBe(true);
      expect(state.error).toBeNull();
    });

    it('does not clear previously loaded transactions (stale data stays visible while refetching)', () => {
      const previous: MyTransactionsState = {
        ...initialMyTransactionsState,
        transactions: [transaction],
        loaded: true,
      };
      const state = reducer(previous, myTransactionsActions.loadHistory({ query: { page: 1, limit: 20 } }));
      expect(state.transactions).toEqual([transaction]);
    });
  });

  describe('loadHistorySuccess', () => {
    it('populates transactions + pagination metadata and marks loaded', () => {
      const previous: MyTransactionsState = { ...initialMyTransactionsState, loading: true };
      const state = reducer(previous, myTransactionsActions.loadHistorySuccess({ result }));

      expect(state).toEqual({
        ...initialMyTransactionsState,
        transactions: [transaction],
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        loading: false,
        loaded: true,
        error: null,
        query: initialMyTransactionsState.query,
      });
    });
  });

  describe('loadHistoryFailure', () => {
    it('sets the error (e.g. 422 NoOriginAccountException reused by the backend), marks loaded, and keeps whatever transactions were already there', () => {
      const previous: MyTransactionsState = {
        ...initialMyTransactionsState,
        transactions: [transaction],
        loading: true,
      };
      const state = reducer(
        previous,
        myTransactionsActions.loadHistoryFailure({
          error: 'No se encontró una única cuenta de origen para este usuario',
        }),
      );

      expect(state.error).toBe('No se encontró una única cuenta de origen para este usuario');
      expect(state.loading).toBe(false);
      expect(state.loaded).toBe(true);
      expect(state.transactions).toEqual([transaction]);
    });
  });
});

describe('myTransactions selectors', () => {
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
