import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Store } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';

import { accountLookupActions } from '../../../state/accountLookup/account-lookup.actions';
import {
  AccountLookupState,
  initialAccountLookupState,
} from '../../../state/accountLookup/account-lookup.model';
import { myAccountActions } from '../../../state/myAccount/my-account.actions';
import { MyAccount, initialMyAccountState } from '../../../state/myAccount/my-account.model';
import { transferActions } from '../../../state/transfer/transfer.actions';
import { TransferResult, initialTransferState } from '../../../state/transfer/transfer.model';
import { TransferFormPage } from './transfer-form.page';

const account: MyAccount = {
  id: 'acc-1',
  accountNumber: '1000000001',
  balance: '898.00',
  accountType: 'BASIC',
  status: 'ACTIVE',
  avatarUrl: null,
};

const result: TransferResult = {
  id: 'tx-1',
  originAccountId: 'acc-1',
  destAccountId: 'dest-uuid-1',
  amount: '100.00',
  commission: '2.00',
  authorizationCode: 'ABC123',
  status: 'COMPLETED',
  createdAt: '2026-08-28T00:00:00.000Z',
};

/** Estado de `accountLookup` con una resolución EXITOSA para `accountNumber`. */
function resolved(accountNumber: string, id = 'dest-uuid-1', accountType: 'BASIC' | 'PREMIUM' | 'CORPORATE' = 'PREMIUM'): AccountLookupState {
  return {
    requestedAccountNumber: accountNumber,
    result: { id, accountNumber, accountType },
    loading: false,
    error: null,
  };
}

/** Estado de `accountLookup` con una resolución FALLIDA (404) para `accountNumber`. */
function failed(accountNumber: string, message = 'La cuenta destino "9999" no existe'): AccountLookupState {
  return { requestedAccountNumber: accountNumber, result: null, loading: false, error: message };
}

function create() {
  TestBed.configureTestingModule({
    providers: [
      provideMockStore({
        initialState: {
          myAccount: initialMyAccountState,
          transfer: initialTransferState,
          accountLookup: initialAccountLookupState,
        },
      }),
    ],
  });

  const store = TestBed.inject(Store) as MockStore;
  const dispatchSpy = vi.spyOn(store, 'dispatch');
  const fixture = TestBed.createComponent(TransferFormPage);
  fixture.detectChanges();

  return { fixture, store, dispatchSpy };
}

function submitAction(calls: unknown[][]) {
  return calls
    .map((c) => c[0])
    .find(
      (a): a is ReturnType<typeof transferActions.submitTransfer> =>
        (a as { type: string }).type === transferActions.submitTransfer.type,
    );
}

function lookupAction(calls: unknown[][]) {
  return calls
    .map((c) => c[0])
    .find(
      (a): a is ReturnType<typeof accountLookupActions.lookupAccount> =>
        (a as { type: string }).type === accountLookupActions.lookupAccount.type,
    );
}

/**
 * Setea el formulario con un número de cuenta ya resuelto en el Store
 * (simula que el blur ya corrió y el effect ya guardó la respuesta), para
 * poder probar submit()/retry() sin depender del flujo de resolución en sí
 * (eso lo prueba el describe de "resolución de cuenta destino" más abajo).
 */
function setResolvedForm(
  fixture: ReturnType<typeof create>['fixture'],
  store: MockStore,
  accountNumber: string,
  amount: string,
  id = 'dest-uuid-1',
) {
  fixture.componentInstance.form.setValue({ destAccountNumber: accountNumber, amount });
  store.setState({
    myAccount: initialMyAccountState,
    transfer: initialTransferState,
    accountLookup: resolved(accountNumber, id),
  });
  fixture.detectChanges();
}

describe('TransferFormPage', () => {
  it('dispatches loadMyAccount on init (tarea 4)', () => {
    const { dispatchSpy } = create();

    expect(dispatchSpy).toHaveBeenCalledWith(myAccountActions.loadMyAccount());
  });

  describe('estados del saldo (mismo patrón de 3 estados que AccountListPage, Sesión 14)', () => {
    it('shows the skeleton loader during the initial load', () => {
      const { fixture, store } = create();
      store.setState({
        myAccount: { ...initialMyAccountState, loading: true, loaded: false },
        transfer: initialTransferState,
        accountLookup: initialAccountLookupState,
      });
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.css('app-skeleton-loader'))).toBeTruthy();
      expect(fixture.debugElement.query(By.css('.balance-card__balance'))).toBeFalsy();
    });

    it('shows an error banner with retry, without crashing, when the balance fails to load', () => {
      const { fixture, store } = create();
      store.setState({
        myAccount: {
          ...initialMyAccountState,
          loading: false,
          loaded: true,
          error: 'No se pudo cargar tu cuenta.',
        },
        transfer: initialTransferState,
        accountLookup: initialAccountLookupState,
      });
      fixture.detectChanges();

      const banner = fixture.debugElement.query(By.css('.balance-card .error-banner'));
      expect(banner.nativeElement.textContent).toContain('No se pudo cargar tu cuenta.');
      expect(banner.query(By.css('button'))).toBeTruthy();
    });

    it('retrying the balance re-dispatches loadMyAccount', () => {
      const { fixture, store, dispatchSpy } = create();
      store.setState({
        myAccount: { ...initialMyAccountState, loaded: true, error: 'boom' },
        transfer: initialTransferState,
        accountLookup: initialAccountLookupState,
      });
      fixture.detectChanges();
      dispatchSpy.mockClear();

      fixture.debugElement.query(By.css('.balance-card .error-banner button')).nativeElement.click();

      expect(dispatchSpy).toHaveBeenCalledWith(myAccountActions.loadMyAccount());
    });

    it('shows an explicit empty state when loaded with no account and no error (never a blank card)', () => {
      const { fixture, store } = create();
      store.setState({
        myAccount: { ...initialMyAccountState, loading: false, loaded: true, account: null },
        transfer: initialTransferState,
        accountLookup: initialAccountLookupState,
      });
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.css('.empty-state')).nativeElement.textContent).toContain(
        'No tenés ninguna cuenta',
      );
    });

    it('shows the balance, dimmed while refetching (stale data stays visible, mismo criterio que AccountTableComponent)', () => {
      const { fixture, store } = create();
      store.setState({
        myAccount: { ...initialMyAccountState, loading: true, loaded: true, account },
        transfer: initialTransferState,
        accountLookup: initialAccountLookupState,
      });
      fixture.detectChanges();

      const content = fixture.debugElement.query(By.css('.balance-card__content'));
      expect(content.nativeElement.textContent).toContain('898.00');
      expect(content.nativeElement.classList).toContain('refetching');
    });
  });

  describe('validación del formulario sin backend', () => {
    it('submit() with an invalid (empty) form does not dispatch, marks controls as touched, and shows the required messages', () => {
      const { fixture, dispatchSpy } = create();
      dispatchSpy.mockClear();

      fixture.componentInstance.submit();
      fixture.detectChanges();

      expect(dispatchSpy).not.toHaveBeenCalled();
      expect(fixture.componentInstance.form.controls.destAccountNumber.touched).toBe(true);
      expect(fixture.componentInstance.form.controls.amount.touched).toBe(true);
      const errors = fixture.debugElement.queryAll(By.css('.field-error'));
      expect(errors.map((e) => e.nativeElement.textContent)).toEqual([
        'La cuenta destino es obligatoria.',
        'El monto es obligatorio.',
      ]);
    });

    it('shows the positiveDecimalAmount message once the amount field is touched with an invalid value', () => {
      const { fixture } = create();
      fixture.componentInstance.form.controls.amount.setValue('10.999');
      fixture.componentInstance.form.controls.amount.markAsTouched();
      fixture.detectChanges();

      const errors = fixture.debugElement.queryAll(By.css('.field-error'));
      expect(errors.map((e) => e.nativeElement.textContent.trim())).toContain(
        'Ingresá un monto positivo con hasta 2 decimales (ej. "100.50").',
      );
    });

    it.each(['0', '0.00', '-5', '10.123', 'abc'])(
      'rejects an invalid amount "%s" client-side, mirroring @IsPositiveDecimalString',
      (amount) => {
        const { fixture } = create();
        fixture.componentInstance.form.setValue({ destAccountNumber: '1000000002', amount });

        expect(fixture.componentInstance.form.controls.amount.hasError('positiveDecimalAmount')).toBe(
          true,
        );
      },
    );

    it('accepts a well-formed amount and a non-empty destination account number', () => {
      const { fixture } = create();
      fixture.componentInstance.form.setValue({ destAccountNumber: '1000000002', amount: '100.50' });

      expect(fixture.componentInstance.form.valid).toBe(true);
    });
  });

  describe('botón "Transferir" deshabilitado con formulario inválido (Sesión 18, bug fix)', () => {
    it('is disabled while the form is empty/invalid, even though not submitting', () => {
      const { fixture } = create();

      const button = fixture.debugElement.query(By.css('button[type=submit]'));
      expect(fixture.componentInstance.form.invalid).toBe(true);
      expect(button.nativeElement.disabled).toBe(true);
    });

    it('becomes enabled once the form has valid values, and disabled again if cleared', () => {
      const { fixture } = create();
      const button = fixture.debugElement.query(By.css('button[type=submit]'));

      fixture.componentInstance.form.setValue({ destAccountNumber: '1000000002', amount: '10.00' });
      fixture.detectChanges();
      expect(button.nativeElement.disabled).toBe(false);

      fixture.componentInstance.form.setValue({ destAccountNumber: '', amount: '' });
      fixture.detectChanges();
      expect(button.nativeElement.disabled).toBe(true);
    });

    it('is disabled while a lookup is in flight, even with a valid form', () => {
      const { fixture, store } = create();
      fixture.componentInstance.form.setValue({ destAccountNumber: '1000000002', amount: '10.00' });
      store.setState({
        myAccount: initialMyAccountState,
        transfer: initialTransferState,
        accountLookup: { requestedAccountNumber: '1000000002', result: null, loading: true, error: null },
      });
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.css('button[type=submit]')).nativeElement.disabled).toBe(
        true,
      );
    });
  });

  describe('resolución de cuenta destino por número de cuenta (Sesión 20, GET /accounts/lookup)', () => {
    it('blurring a non-empty destination field dispatches lookupAccount', () => {
      const { fixture, dispatchSpy } = create();
      fixture.componentInstance.form.controls.destAccountNumber.setValue('1000000002');
      dispatchSpy.mockClear();

      fixture.componentInstance.onDestAccountNumberBlur();

      expect(dispatchSpy).toHaveBeenCalledWith(
        accountLookupActions.lookupAccount({ accountNumber: '1000000002' }),
      );
    });

    it('blurring an empty destination field does not dispatch anything', () => {
      const { dispatchSpy, fixture } = create();
      fixture.componentInstance.form.controls.destAccountNumber.setValue('   ');
      dispatchSpy.mockClear();

      fixture.componentInstance.onDestAccountNumberBlur();

      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('blurring again with the same already-resolved number does not re-dispatch', () => {
      const { fixture, store, dispatchSpy } = create();
      fixture.componentInstance.form.controls.destAccountNumber.setValue('1000000002');
      store.setState({
        myAccount: initialMyAccountState,
        transfer: initialTransferState,
        accountLookup: resolved('1000000002'),
      });
      fixture.detectChanges();
      dispatchSpy.mockClear();

      fixture.componentInstance.onDestAccountNumberBlur();

      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('shows a loading message while the lookup for the current number is in flight', () => {
      const { fixture, store } = create();
      fixture.componentInstance.form.controls.destAccountNumber.setValue('1000000002');
      store.setState({
        myAccount: initialMyAccountState,
        transfer: initialTransferState,
        accountLookup: { requestedAccountNumber: '1000000002', result: null, loading: true, error: null },
      });
      fixture.detectChanges();

      expect(
        fixture.debugElement.query(By.css('.lookup-status--loading')).nativeElement.textContent,
      ).toContain('Resolviendo cuenta destino');
    });

    it('shows a confirmation with the resolved accountType (visual confirmation before transferring)', () => {
      const { fixture, store } = create();
      fixture.componentInstance.form.controls.destAccountNumber.setValue('1000000002');
      store.setState({
        myAccount: initialMyAccountState,
        transfer: initialTransferState,
        accountLookup: resolved('1000000002', 'dest-uuid-1', 'CORPORATE'),
      });
      fixture.detectChanges();

      const status = fixture.debugElement.query(By.css('.lookup-status--success'));
      expect(status.nativeElement.textContent).toContain('CORPORATE');
    });

    it('shows the 404 error BEFORE any submit attempt, as soon as the lookup resolves (tarea 3)', () => {
      const { fixture, store, dispatchSpy } = create();
      fixture.componentInstance.form.controls.destAccountNumber.setValue('9999999999');
      store.setState({
        myAccount: initialMyAccountState,
        transfer: initialTransferState,
        accountLookup: failed('9999999999'),
      });
      fixture.detectChanges();

      expect(
        fixture.debugElement.query(By.css('.lookup-status--error')).nativeElement.textContent,
      ).toContain('no existe');
      // Ningún submitTransfer se disparó solo porque el lookup falló.
      expect(submitAction(dispatchSpy.mock.calls)).toBeUndefined();
    });

    it('hides a stale confirmation/error once the user edits the field to a different number', () => {
      const { fixture, store } = create();
      fixture.componentInstance.form.controls.destAccountNumber.setValue('1000000002');
      store.setState({
        myAccount: initialMyAccountState,
        transfer: initialTransferState,
        accountLookup: resolved('1000000002'),
      });
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('.lookup-status--success'))).toBeTruthy();

      fixture.componentInstance.form.controls.destAccountNumber.setValue('1000000099');
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.css('.lookup-status--success'))).toBeFalsy();
      expect(fixture.debugElement.query(By.css('.lookup-status--error'))).toBeFalsy();
    });
  });

  describe('submit exitoso (tarea 5, 201)', () => {
    it('when the number is already resolved, submits immediately with the resolved id and a fresh UUID key', () => {
      const { fixture, store, dispatchSpy } = create();
      setResolvedForm(fixture, store, '1000000002', '10.00', 'dest-uuid-1');
      dispatchSpy.mockClear();

      fixture.componentInstance.submit();

      const action = submitAction(dispatchSpy.mock.calls)!;
      expect(action.destAccountId).toBe('dest-uuid-1');
      expect(action.amount).toBe('10.00');
      expect(action.idempotencyKey).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('when the number was never resolved (blur never fired, ej. submit por Enter), submit() resolves it and completes the transfer once it succeeds', () => {
      const { fixture, store, dispatchSpy } = create();
      fixture.componentInstance.form.setValue({ destAccountNumber: '1000000002', amount: '10.00' });
      dispatchSpy.mockClear();

      fixture.componentInstance.submit();

      expect(lookupAction(dispatchSpy.mock.calls)).toEqual(
        accountLookupActions.lookupAccount({ accountNumber: '1000000002' }),
      );
      expect(submitAction(dispatchSpy.mock.calls)).toBeUndefined();

      dispatchSpy.mockClear();
      store.setState({
        myAccount: initialMyAccountState,
        transfer: initialTransferState,
        accountLookup: resolved('1000000002', 'dest-uuid-1'),
      });
      fixture.detectChanges();

      const action = submitAction(dispatchSpy.mock.calls)!;
      expect(action.destAccountId).toBe('dest-uuid-1');
      expect(action.amount).toBe('10.00');
    });

    it('when the submit-triggered resolution fails (404), never dispatches submitTransfer', () => {
      const { fixture, store, dispatchSpy } = create();
      fixture.componentInstance.form.setValue({ destAccountNumber: '9999999999', amount: '10.00' });

      fixture.componentInstance.submit();
      dispatchSpy.mockClear();
      store.setState({
        myAccount: initialMyAccountState,
        transfer: initialTransferState,
        accountLookup: failed('9999999999'),
      });
      fixture.detectChanges();

      expect(submitAction(dispatchSpy.mock.calls)).toBeUndefined();
    });

    it('submit() with an already-failed resolution for the current number does not retry on its own', () => {
      const { fixture, store, dispatchSpy } = create();
      fixture.componentInstance.form.setValue({ destAccountNumber: '9999999999', amount: '10.00' });
      store.setState({
        myAccount: initialMyAccountState,
        transfer: initialTransferState,
        accountLookup: failed('9999999999'),
      });
      fixture.detectChanges();
      dispatchSpy.mockClear();

      fixture.componentInstance.submit();

      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('on transferSuccess: shows the authorizationCode, resets the form, and re-dispatches loadMyAccount', () => {
      const { fixture, store, dispatchSpy } = create();
      setResolvedForm(fixture, store, '1000000002', '10.00');
      dispatchSpy.mockClear();

      store.setState({
        myAccount: { ...initialMyAccountState, loaded: true, account },
        transfer: { ...initialTransferState, result },
        accountLookup: resolved('1000000002'),
      });
      fixture.detectChanges();

      expect(
        fixture.debugElement.query(By.css('.success-banner')).nativeElement.textContent,
      ).toContain('ABC123');
      expect(fixture.componentInstance.form.value).toEqual({ destAccountNumber: '', amount: '' });
      expect(dispatchSpy).toHaveBeenCalledWith(myAccountActions.loadMyAccount());
    });
  });

  describe('loading con contexto (tarea 6)', () => {
    it('shows "Verificando la transferencia…" instead of a silent spinner while submitting', () => {
      const { fixture, store } = create();
      store.setState({
        myAccount: initialMyAccountState,
        transfer: { ...initialTransferState, submitting: true },
        accountLookup: initialAccountLookupState,
      });
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('button[type=submit]'));
      expect(button.nativeElement.textContent).toContain('Verificando la transferencia');
      expect(button.nativeElement.disabled).toBe(true);
    });

    it('shows "Resolviendo cuenta destino…" on the button while a lookup is in flight', () => {
      const { fixture, store } = create();
      fixture.componentInstance.form.controls.destAccountNumber.setValue('1000000002');
      store.setState({
        myAccount: initialMyAccountState,
        transfer: initialTransferState,
        accountLookup: { requestedAccountNumber: '1000000002', result: null, loading: true, error: null },
      });
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('button[type=submit]'));
      expect(button.nativeElement.textContent).toContain('Resolviendo cuenta destino');
    });
  });

  describe('manejo diferenciado por código (tarea 5, cada uno con su propio mensaje/acción)', () => {
    it.each([
      [400, 'amount inválido', false],
      [403, 'Forbidden resource', false],
      [404, 'La cuenta destino "x" no existe', false],
      [422, 'Fondos insuficientes para completar la transferencia', false],
      [504, 'El servicio anti-fraude no respondió a tiempo.', true],
      [409, 'Ya hay una transferencia en curso con esta X-Idempotency-Key.', true],
    ])('status %i shows the backend message, and a retry button only when retryable (%s)', (status, message, hasRetry) => {
      const { fixture, store } = create();
      store.setState({
        myAccount: initialMyAccountState,
        transfer: { ...initialTransferState, errorStatus: status, errorMessage: message },
        accountLookup: initialAccountLookupState,
      });
      fixture.detectChanges();

      const banner = fixture.debugElement.query(By.css('main > .error-banner'));
      expect(banner.nativeElement.textContent).toContain(message);

      const retryButton = banner.query(By.css('button'));
      if (hasRetry) {
        expect(retryButton).toBeTruthy();
      } else {
        expect(retryButton).toBeFalsy();
      }
    });

    it('a failed transfer (422) keeps the typed destAccountNumber/amount in the form (tarea 8, corregir sin retipear)', () => {
      const { fixture, store } = create();
      fixture.componentInstance.form.setValue({ destAccountNumber: '1000000002', amount: '999999.00' });

      store.setState({
        myAccount: initialMyAccountState,
        transfer: {
          ...initialTransferState,
          errorStatus: 422,
          errorMessage: 'Fondos insuficientes para completar la transferencia',
        },
        accountLookup: initialAccountLookupState,
      });
      fixture.detectChanges();

      expect(fixture.componentInstance.form.value).toEqual({
        destAccountNumber: '1000000002',
        amount: '999999.00',
      });
    });
  });

  describe('504 vs 409: la diferencia de UX más importante de la sesión (tarea 5/11, comparación directa de valores)', () => {
    it('504 retry generates a NEW idempotencyKey, different from the original attempt', () => {
      const { fixture, store, dispatchSpy } = create();
      setResolvedForm(fixture, store, '1000000002', '10.00');
      fixture.componentInstance.submit();
      const originalKey = submitAction(dispatchSpy.mock.calls)!.idempotencyKey;

      store.setState({
        myAccount: initialMyAccountState,
        transfer: {
          ...initialTransferState,
          errorStatus: 504,
          errorMessage: 'El servicio anti-fraude no respondió a tiempo.',
        },
        accountLookup: resolved('1000000002'),
      });
      fixture.detectChanges();
      dispatchSpy.mockClear();

      fixture.componentInstance.retry();
      const retryKey = submitAction(dispatchSpy.mock.calls)!.idempotencyKey;

      expect(retryKey).not.toBe(originalKey);
    });

    it('409 retry reuses the exact SAME idempotencyKey as the original attempt, and the same resolved destAccountId', () => {
      const { fixture, store, dispatchSpy } = create();
      setResolvedForm(fixture, store, '1000000002', '10.00', 'dest-uuid-1');
      fixture.componentInstance.submit();
      const originalAction = submitAction(dispatchSpy.mock.calls)!;

      store.setState({
        myAccount: initialMyAccountState,
        transfer: {
          ...initialTransferState,
          errorStatus: 409,
          errorMessage: 'Ya hay una transferencia en curso con esta X-Idempotency-Key.',
        },
        accountLookup: resolved('1000000002'),
      });
      fixture.detectChanges();
      dispatchSpy.mockClear();

      fixture.componentInstance.retry();
      const retryAction = submitAction(dispatchSpy.mock.calls)!;

      expect(retryAction.idempotencyKey).toBe(originalAction.idempotencyKey);
      expect(retryAction.destAccountId).toBe('dest-uuid-1');
    });

    it('retry() is a no-op when there is no current error to react to', () => {
      const { fixture, dispatchSpy } = create();
      dispatchSpy.mockClear();

      fixture.componentInstance.retry();

      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('retry() is a defensive no-op when there was never a resolved destination to retry with', () => {
      const { fixture, store, dispatchSpy } = create();
      store.setState({
        myAccount: initialMyAccountState,
        transfer: { ...initialTransferState, errorStatus: 409, errorMessage: 'boom' },
        accountLookup: initialAccountLookupState,
      });
      fixture.detectChanges();
      dispatchSpy.mockClear();

      fixture.componentInstance.retry();

      expect(dispatchSpy).not.toHaveBeenCalled();
    });
  });

  it('an unmapped error status renders without helpText/retry (fallback seguro, no crashea)', () => {
    const { fixture, store } = create();
    store.setState({
      myAccount: initialMyAccountState,
      transfer: { ...initialTransferState, errorStatus: 500, errorMessage: 'Internal server error' },
      accountLookup: initialAccountLookupState,
    });
    fixture.detectChanges();

    const banner = fixture.debugElement.query(By.css('main > .error-banner'));
    expect(banner.nativeElement.textContent).toContain('Internal server error');
    expect(banner.query(By.css('.error-banner__help'))).toBeFalsy();
    expect(banner.query(By.css('button'))).toBeFalsy();
  });
});
