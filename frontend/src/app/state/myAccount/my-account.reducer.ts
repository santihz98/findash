import { createFeature, createReducer, createSelector, on } from '@ngrx/store';

import { myAccountActions } from './my-account.actions';
import { initialMyAccountState } from './my-account.model';

const reducer = createReducer(
  initialMyAccountState,

  on(myAccountActions.loadMyAccount, (state) => ({ ...state, loading: true, error: null })),

  on(myAccountActions.loadMyAccountSuccess, (state, { account }) => ({
    ...state,
    account,
    loading: false,
    loaded: true,
    error: null,
  })),

  on(myAccountActions.loadMyAccountFailure, (state, { error }) => ({
    ...state,
    loading: false,
    loaded: true,
    error,
  })),
);

export const myAccountFeature = createFeature({
  name: 'myAccount',
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
  name: myAccountFeatureKey,
  reducer: myAccountReducer,
  selectAccount: selectMyAccount,
  selectLoading: selectMyAccountLoading,
  selectLoaded: selectMyAccountLoaded,
  selectError: selectMyAccountError,
  selectIsInitialLoading: selectMyAccountIsInitialLoading,
  selectIsRefetching: selectMyAccountIsRefetching,
} = myAccountFeature;
