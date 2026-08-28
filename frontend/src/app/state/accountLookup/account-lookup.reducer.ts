import { createFeature, createReducer, on } from '@ngrx/store';

import { accountLookupActions } from './account-lookup.actions';
import { initialAccountLookupState } from './account-lookup.model';

const reducer = createReducer(
  initialAccountLookupState,

  on(accountLookupActions.lookupAccount, (state, { accountNumber }) => ({
    ...state,
    requestedAccountNumber: accountNumber,
    loading: true,
    result: null,
    error: null,
  })),

  on(accountLookupActions.lookupAccountSuccess, (state, { result }) => ({
    ...state,
    loading: false,
    result,
    error: null,
  })),

  on(accountLookupActions.lookupAccountFailure, (state, { message }) => ({
    ...state,
    loading: false,
    result: null,
    error: message,
  })),
);

export const accountLookupFeature = createFeature({
  name: 'accountLookup',
  reducer,
});

export const {
  name: accountLookupFeatureKey,
  reducer: accountLookupReducer,
  selectRequestedAccountNumber: selectAccountLookupRequestedAccountNumber,
  selectResult: selectAccountLookupResult,
  selectLoading: selectAccountLookupLoading,
  selectError: selectAccountLookupError,
} = accountLookupFeature;
