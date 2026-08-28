import { accountLookupActions } from './account-lookup.actions';
import { AccountLookupState, initialAccountLookupState } from './account-lookup.model';
import { accountLookupFeature } from './account-lookup.reducer';

const { reducer } = accountLookupFeature;

describe('accountLookupReducer', () => {
  it('returns the initial state for an unknown action', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual(initialAccountLookupState);
  });

  describe('lookupAccount', () => {
    it('stores the requested accountNumber, sets loading, and clears any previous result/error', () => {
      const previous: AccountLookupState = {
        requestedAccountNumber: '1111111111',
        result: { id: 'old-id', accountNumber: '1111111111', accountType: 'BASIC' },
        loading: false,
        error: 'boom',
      };
      const state = reducer(
        previous,
        accountLookupActions.lookupAccount({ accountNumber: '2222222222' }),
      );

      expect(state).toEqual({
        requestedAccountNumber: '2222222222',
        result: null,
        loading: true,
        error: null,
      });
    });
  });

  describe('lookupAccountSuccess', () => {
    it('stores the result and clears loading/error', () => {
      const previous: AccountLookupState = {
        requestedAccountNumber: '2222222222',
        result: null,
        loading: true,
        error: null,
      };
      const result = { id: 'dest-1', accountNumber: '2222222222', accountType: 'CORPORATE' as const };

      const state = reducer(previous, accountLookupActions.lookupAccountSuccess({ result }));

      expect(state).toEqual({
        requestedAccountNumber: '2222222222',
        result,
        loading: false,
        error: null,
      });
    });
  });

  describe('lookupAccountFailure', () => {
    it('stores the message and clears loading/result', () => {
      const previous: AccountLookupState = {
        requestedAccountNumber: '9999999999',
        result: null,
        loading: true,
        error: null,
      };

      const state = reducer(
        previous,
        accountLookupActions.lookupAccountFailure({ message: 'La cuenta destino no existe' }),
      );

      expect(state).toEqual({
        requestedAccountNumber: '9999999999',
        result: null,
        loading: false,
        error: 'La cuenta destino no existe',
      });
    });
  });
});
