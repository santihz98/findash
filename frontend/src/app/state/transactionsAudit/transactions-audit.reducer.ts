import { createFeature, createReducer, createSelector, on } from '@ngrx/store';

import { transactionsAuditActions } from './transactions-audit.actions';
import { initialTransactionsAuditState } from './transactions-audit.model';

const reducer = createReducer(
  initialTransactionsAuditState,

  on(transactionsAuditActions.loadTransactions, (state, { query }) => ({
    ...state,
    query,
    loading: true,
    error: null,
  })),

  on(transactionsAuditActions.loadTransactionsSuccess, (state, { result }) => ({
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

  on(transactionsAuditActions.loadTransactionsFailure, (state, { error }) => ({
    ...state,
    loading: false,
    loaded: true,
    error,
  })),
);

export const transactionsAuditFeature = createFeature({
  name: 'transactionsAudit',
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
  name: transactionsAuditFeatureKey,
  reducer: transactionsAuditReducer,
  selectTransactions: selectAuditTransactions,
  selectPage: selectAuditPage,
  selectLimit: selectAuditLimit,
  selectTotal: selectAuditTotal,
  selectTotalPages: selectAuditTotalPages,
  selectQuery: selectAuditQuery,
  selectLoading: selectAuditLoading,
  selectLoaded: selectAuditLoaded,
  selectError: selectAuditError,
  selectIsInitialLoading: selectAuditIsInitialLoading,
  selectIsRefetching: selectAuditIsRefetching,
} = transactionsAuditFeature;
