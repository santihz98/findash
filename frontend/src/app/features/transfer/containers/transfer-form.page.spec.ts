import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Store } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';

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
  destAccountId: 'acc-2',
  amount: '100.00',
  commission: '2.00',
  authorizationCode: 'ABC123',
  status: 'COMPLETED',
  createdAt: '2026-08-28T00:00:00.000Z',
};

function create() {
  TestBed.configureTestingModule({
    providers: [
      provideMockStore({
        initialState: { myAccount: initialMyAccountState, transfer: initialTransferState },
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
      expect(fixture.componentInstance.form.controls.destAccountId.touched).toBe(true);
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
        fixture.componentInstance.form.setValue({ destAccountId: 'dest-1', amount });

        expect(fixture.componentInstance.form.controls.amount.hasError('positiveDecimalAmount')).toBe(
          true,
        );
      },
    );

    it('accepts a well-formed amount and a non-empty destination id', () => {
      const { fixture } = create();
      fixture.componentInstance.form.setValue({ destAccountId: 'dest-1', amount: '100.50' });

      expect(fixture.componentInstance.form.valid).toBe(true);
    });
  });

  describe('submit exitoso (tarea 5, 201)', () => {
    it('dispatches submitTransfer with the typed values and a fresh UUID idempotencyKey', () => {
      const { fixture, dispatchSpy } = create();
      dispatchSpy.mockClear();
      fixture.componentInstance.form.setValue({ destAccountId: 'dest-1', amount: '10.00' });

      fixture.componentInstance.submit();

      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      const action = submitAction(dispatchSpy.mock.calls)!;
      expect(action.destAccountId).toBe('dest-1');
      expect(action.amount).toBe('10.00');
      expect(action.idempotencyKey).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('on transferSuccess: shows the authorizationCode, resets the form, and re-dispatches loadMyAccount', () => {
      const { fixture, store, dispatchSpy } = create();
      fixture.componentInstance.form.setValue({ destAccountId: 'dest-1', amount: '10.00' });
      dispatchSpy.mockClear();

      store.setState({
        myAccount: { ...initialMyAccountState, loaded: true, account },
        transfer: { ...initialTransferState, result },
      });
      fixture.detectChanges();

      expect(
        fixture.debugElement.query(By.css('.success-banner')).nativeElement.textContent,
      ).toContain('ABC123');
      expect(fixture.componentInstance.form.value).toEqual({ destAccountId: '', amount: '' });
      expect(dispatchSpy).toHaveBeenCalledWith(myAccountActions.loadMyAccount());
    });
  });

  describe('loading con contexto (tarea 6)', () => {
    it('shows "Verificando la transferencia…" instead of a silent spinner while submitting', () => {
      const { fixture, store } = create();
      store.setState({
        myAccount: initialMyAccountState,
        transfer: { ...initialTransferState, submitting: true },
      });
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('button[type=submit]'));
      expect(button.nativeElement.textContent).toContain('Verificando la transferencia');
      expect(button.nativeElement.disabled).toBe(true);
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

    it('a failed transfer (422) keeps the typed destAccountId/amount in the form (tarea 8, corregir sin retipear)', () => {
      const { fixture, store } = create();
      fixture.componentInstance.form.setValue({ destAccountId: 'dest-1', amount: '999999.00' });

      store.setState({
        myAccount: initialMyAccountState,
        transfer: {
          ...initialTransferState,
          errorStatus: 422,
          errorMessage: 'Fondos insuficientes para completar la transferencia',
        },
      });
      fixture.detectChanges();

      expect(fixture.componentInstance.form.value).toEqual({
        destAccountId: 'dest-1',
        amount: '999999.00',
      });
    });
  });

  describe('504 vs 409: la diferencia de UX más importante de la sesión (tarea 5/11, comparación directa de valores)', () => {
    it('504 retry generates a NEW idempotencyKey, different from the original attempt', () => {
      const { fixture, store, dispatchSpy } = create();
      fixture.componentInstance.form.setValue({ destAccountId: 'dest-1', amount: '10.00' });
      fixture.componentInstance.submit();
      const originalKey = submitAction(dispatchSpy.mock.calls)!.idempotencyKey;

      store.setState({
        myAccount: initialMyAccountState,
        transfer: {
          ...initialTransferState,
          errorStatus: 504,
          errorMessage: 'El servicio anti-fraude no respondió a tiempo.',
        },
      });
      fixture.detectChanges();
      dispatchSpy.mockClear();

      fixture.componentInstance.retry();
      const retryKey = submitAction(dispatchSpy.mock.calls)!.idempotencyKey;

      expect(retryKey).not.toBe(originalKey);
    });

    it('409 retry reuses the exact SAME idempotencyKey as the original attempt', () => {
      const { fixture, store, dispatchSpy } = create();
      fixture.componentInstance.form.setValue({ destAccountId: 'dest-1', amount: '10.00' });
      fixture.componentInstance.submit();
      const originalKey = submitAction(dispatchSpy.mock.calls)!.idempotencyKey;

      store.setState({
        myAccount: initialMyAccountState,
        transfer: {
          ...initialTransferState,
          errorStatus: 409,
          errorMessage: 'Ya hay una transferencia en curso con esta X-Idempotency-Key.',
        },
      });
      fixture.detectChanges();
      dispatchSpy.mockClear();

      fixture.componentInstance.retry();
      const retryKey = submitAction(dispatchSpy.mock.calls)!.idempotencyKey;

      expect(retryKey).toBe(originalKey);
    });

    it('retry() is a no-op when there is no current error to react to', () => {
      const { fixture, dispatchSpy } = create();
      dispatchSpy.mockClear();

      fixture.componentInstance.retry();

      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('same-key retry falls back to a fresh UUID if there is no prior attempt to reuse (defensivo)', () => {
      const { fixture, store, dispatchSpy } = create();
      store.setState({
        myAccount: initialMyAccountState,
        transfer: { ...initialTransferState, errorStatus: 409, errorMessage: 'boom' },
      });
      fixture.detectChanges();
      dispatchSpy.mockClear();

      fixture.componentInstance.retry();

      const action = submitAction(dispatchSpy.mock.calls)!;
      expect(action.idempotencyKey).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });
  });

  it('an unmapped error status renders without helpText/retry (fallback seguro, no crashea)', () => {
    const { fixture, store } = create();
    store.setState({
      myAccount: initialMyAccountState,
      transfer: { ...initialTransferState, errorStatus: 500, errorMessage: 'Internal server error' },
    });
    fixture.detectChanges();

    const banner = fixture.debugElement.query(By.css('main > .error-banner'));
    expect(banner.nativeElement.textContent).toContain('Internal server error');
    expect(banner.query(By.css('.error-banner__help'))).toBeFalsy();
    expect(banner.query(By.css('button'))).toBeFalsy();
  });
});
