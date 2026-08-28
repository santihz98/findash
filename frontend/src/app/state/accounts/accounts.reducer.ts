import { createFeature, createReducer, createSelector, on } from '@ngrx/store';

import { accountsActions } from './accounts.actions';
import { initialAccountsState } from './accounts.model';

const reducer = createReducer(
  initialAccountsState,

  on(accountsActions.loadAccounts, (state, { query }) => ({
    ...state,
    query,
    loading: true,
    error: null,
  })),

  on(accountsActions.loadAccountsSuccess, (state, { result }) => ({
    ...state,
    accounts: result.data,
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: result.totalPages,
    loading: false,
    loaded: true,
    error: null,
  })),

  on(accountsActions.loadAccountsFailure, (state, { error }) => ({
    ...state,
    loading: false,
    loaded: true,
    error,
  })),
);

export const accountsFeature = createFeature({
  name: 'accounts',
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
  name: accountsFeatureKey,
  reducer: accountsReducer,
  selectAccounts,
  selectPage,
  selectLimit,
  selectTotal,
  selectTotalPages,
  selectQuery,
  selectLoading: selectAccountsLoading,
  selectLoaded,
  selectError: selectAccountsError,
  selectIsInitialLoading,
  selectIsRefetching,
} = accountsFeature;
