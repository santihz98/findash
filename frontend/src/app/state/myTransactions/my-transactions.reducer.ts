import { createFeature, createReducer, createSelector, on } from '@ngrx/store';

import { myTransactionsActions } from './my-transactions.actions';
import { initialMyTransactionsState } from './my-transactions.model';

const reducer = createReducer(
  initialMyTransactionsState,

  on(myTransactionsActions.loadHistory, (state, { query }) => ({
    ...state,
    query,
    loading: true,
    error: null,
  })),

  on(myTransactionsActions.loadHistorySuccess, (state, { result }) => ({
    ...state,
    transactions: result.data,
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: result.totalPages,
    loading: false,
    loaded: true,
    error: null,
  })),

  on(myTransactionsActions.loadHistoryFailure, (state, { error }) => ({
    ...state,
    loading: false,
    loaded: true,
    error,
  })),
);

export const myTransactionsFeature = createFeature({
  name: 'myTransactions',
  reducer,
  extraSelectors: ({ selectLoading, selectLoaded }) => ({
    selectIsInitialLoading: createSelector(
      selectLoading,
      selectLoaded,
      (loading, loaded) => loading && !loaded,
    ),
    selectIsRefetching: createSelector(
      selectLoading,
      selectLoaded,
      (loading, loaded) => loading && loaded,
    ),
  }),
});

export const {
  name: myTransactionsFeatureKey,
  reducer: myTransactionsReducer,
  selectTransactions: selectMyTransactions,
  selectPage: selectMyTransactionsPage,
  selectLimit: selectMyTransactionsLimit,
  selectTotal: selectMyTransactionsTotal,
  selectTotalPages: selectMyTransactionsTotalPages,
  selectQuery: selectMyTransactionsQuery,
  selectLoading: selectMyTransactionsLoading,
  selectLoaded: selectMyTransactionsLoaded,
  selectError: selectMyTransactionsError,
  selectIsInitialLoading: selectMyTransactionsIsInitialLoading,
  selectIsRefetching: selectMyTransactionsIsRefetching,
} = myTransactionsFeature;
