import { transactionsAuditActions } from './transactions-audit.actions';
import {
  AuditTransaction,
  ListTransactionsAuditResult,
  TransactionsAuditState,
  initialTransactionsAuditState,
} from './transactions-audit.model';
import {
  transactionsAuditFeature,
  selectAuditIsInitialLoading as selectIsInitialLoading,
  selectAuditIsRefetching as selectIsRefetching,
} from './transactions-audit.reducer';

const { reducer } = transactionsAuditFeature;

const transaction: AuditTransaction = {
  id: 'tx-1',
  originAccountId: 'acc-1',
  destAccountId: 'acc-2',
  amount: '100.00',
  commission: '2.00',
  authorizationCode: 'ABC123',
  status: 'COMPLETED',
  createdAt: '2026-08-28T00:00:00.000Z',
};

const result: ListTransactionsAuditResult = {
  data: [transaction],
  page: 1,
  limit: 20,
  total: 1,
  totalPages: 1,
};

describe('transactionsAuditReducer', () => {
  it('returns the initial state for an unknown action', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual(initialTransactionsAuditState);
  });

  describe('loadTransactions', () => {
    it('stores the query (incl. filters), sets loading true, and clears any previous error', () => {
      const previous: TransactionsAuditState = { ...initialTransactionsAuditState, error: 'boom' };
      const query = { page: 2, limit: 20, status: 'REJECTED' as const, dateFrom: '2026-08-01' };
      const state = reducer(previous, transactionsAuditActions.loadTransactions({ query }));

      expect(state.query).toEqual(query);
      expect(state.loading).toBe(true);
      expect(state.error).toBeNull();
    });

    it('does not clear previously loaded transactions (stale data stays visible while refetching)', () => {
      const previous: TransactionsAuditState = {
        ...initialTransactionsAuditState,
        transactions: [transaction],
        loaded: true,
      };
      const state = reducer(
        previous,
        transactionsAuditActions.loadTransactions({ query: { page: 1, limit: 20 } }),
      );
      expect(state.transactions).toEqual([transaction]);
    });
  });

  describe('loadTransactionsSuccess', () => {
    it('populates transactions + pagination metadata and marks loaded', () => {
      const previous: TransactionsAuditState = { ...initialTransactionsAuditState, loading: true };
      const state = reducer(previous, transactionsAuditActions.loadTransactionsSuccess({ result }));

      expect(state).toEqual({
        ...initialTransactionsAuditState,
        transactions: [transaction],
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        loading: false,
        loaded: true,
        error: null,
        query: initialTransactionsAuditState.query,
      });
    });
  });

  describe('loadTransactionsFailure', () => {
    it('sets the error, marks loaded, and keeps whatever transactions were already there', () => {
      const previous: TransactionsAuditState = {
        ...initialTransactionsAuditState,
        transactions: [transaction],
        loading: true,
      };
      const state = reducer(
        previous,
        transactionsAuditActions.loadTransactionsFailure({ error: 'No se pudieron cargar' }),
      );

      expect(state.error).toBe('No se pudieron cargar');
      expect(state.loading).toBe(false);
      expect(state.loaded).toBe(true);
      expect(state.transactions).toEqual([transaction]);
    });
  });
});

describe('transactionsAudit selectors', () => {
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
