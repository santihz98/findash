import { myAccountActions } from './my-account.actions';
import { MyAccount, initialMyAccountState } from './my-account.model';
import {
  myAccountReducer,
  selectMyAccountIsInitialLoading as selectIsInitialLoading,
  selectMyAccountIsRefetching as selectIsRefetching,
} from './my-account.reducer';

const account: MyAccount = {
  id: 'acc-1',
  accountNumber: '1000000001',
  balance: '898.00',
  accountType: 'BASIC',
  status: 'ACTIVE',
  avatarUrl: null,
};

describe('myAccountReducer', () => {
  it('loadMyAccount sets loading and clears any previous error', () => {
    const state = myAccountReducer(
      { ...initialMyAccountState, error: 'boom' },
      myAccountActions.loadMyAccount(),
    );

    expect(state.loading).toBe(true);
    expect(state.error).toBeNull();
  });

  it('loadMyAccountSuccess stores the account and marks loaded', () => {
    const state = myAccountReducer(
      { ...initialMyAccountState, loading: true },
      myAccountActions.loadMyAccountSuccess({ account }),
    );

    expect(state.account).toEqual(account);
    expect(state.loading).toBe(false);
    expect(state.loaded).toBe(true);
    expect(state.error).toBeNull();
  });

  it('loadMyAccountSuccess with null (ADMIN, sin cuentas propias) guarda null explícito', () => {
    const state = myAccountReducer(
      { ...initialMyAccountState, loading: true },
      myAccountActions.loadMyAccountSuccess({ account: null }),
    );

    expect(state.account).toBeNull();
    expect(state.loaded).toBe(true);
  });

  it('loadMyAccountFailure marks loaded/error but keeps the stale account (no lo borra)', () => {
    const state = myAccountReducer(
      { ...initialMyAccountState, account, loading: true, loaded: true },
      myAccountActions.loadMyAccountFailure({ error: 'No se pudo cargar tu cuenta.' }),
    );

    expect(state.account).toEqual(account);
    expect(state.loading).toBe(false);
    expect(state.loaded).toBe(true);
    expect(state.error).toBe('No se pudo cargar tu cuenta.');
  });

  it('selectIsInitialLoading / selectIsRefetching a través de las 4 combinaciones', () => {
    expect(selectIsInitialLoading.projector(true, false)).toBe(true);
    expect(selectIsInitialLoading.projector(true, true)).toBe(false);
    expect(selectIsInitialLoading.projector(false, false)).toBe(false);
    expect(selectIsInitialLoading.projector(false, true)).toBe(false);

    expect(selectIsRefetching.projector(true, true)).toBe(true);
    expect(selectIsRefetching.projector(true, false)).toBe(false);
    expect(selectIsRefetching.projector(false, true)).toBe(false);
    expect(selectIsRefetching.projector(false, false)).toBe(false);
  });
});
