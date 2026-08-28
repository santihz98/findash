import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideEffects } from '@ngrx/effects';
import { Store, provideState, provideStore } from '@ngrx/store';

import { routes } from '../../../app.routes';
import { CurrentUser } from '../../../state/auth/auth.model';
import { authFeature } from '../../../state/auth/auth.reducer';
import { MyAccountEffects } from '../../../state/myAccount/my-account.effects';
import { myAccountFeature } from '../../../state/myAccount/my-account.reducer';
import { TransferEffects } from '../../../state/transfer/transfer.effects';
import { transferFeature } from '../../../state/transfer/transfer.reducer';
import { TransferFormPage } from './transfer-form.page';

const clientUser: CurrentUser = {
  id: 'user-2',
  email: 'basic@findash.dev',
  documentNumber: '1010000002',
  role: 'CLIENT',
};

/**
 * Test de integración real (tarea 12): Store + MyAccountEffects/TransferEffects
 * + Router + guard reales, sin mocks de NgRx. El único doble es
 * `HttpTestingController` — un backend fake, nunca el real.
 */
describe('transfer flow (integración real, backend fake)', () => {
  let httpMock: HttpTestingController;

  function configure(): void {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideStore({}),
        provideState(authFeature),
        provideState(myAccountFeature),
        provideState(transferFeature),
        provideEffects([MyAccountEffects, TransferEffects]),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(Store);
    store.dispatch({
      type: '[Auth] Login Success',
      user: clientUser,
      accessToken: 'fake-access',
      refreshToken: 'fake-refresh',
    });
  }

  afterEach(() => httpMock.verify());

  it('flujo completo exitoso: submit -> 201 -> saldo actualizado -> formulario limpio', async () => {
    configure();
    const harness = await RouterTestingHarness.create('/transfer');

    httpMock.expectOne((r) => r.url === 'accounts/me').flush([
      {
        id: 'acc-1',
        accountNumber: '1000000001',
        balance: '898.00',
        accountType: 'BASIC',
        status: 'ACTIVE',
        avatarUrl: null,
      },
    ]);
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent).toContain('898.00');

    const destInput = harness.routeDebugElement!.query(By.css('input[formControlName=destAccountId]'))
      .nativeElement as HTMLInputElement;
    const amountInput = harness.routeDebugElement!.query(By.css('input[formControlName=amount]'))
      .nativeElement as HTMLInputElement;
    destInput.value = 'acc-2';
    destInput.dispatchEvent(new Event('input'));
    amountInput.value = '100.00';
    amountInput.dispatchEvent(new Event('input'));
    harness.detectChanges();

    harness.routeDebugElement!.query(By.css('form')).triggerEventHandler('ngSubmit', undefined);

    const transferReq = httpMock.expectOne((r) => r.url === 'transactions/transfer');
    expect(transferReq.request.body).toEqual({ destAccountId: 'acc-2', amount: '100.00' });
    expect(transferReq.request.headers.get('X-Idempotency-Key')).toBeTruthy();
    transferReq.flush({
      id: 'tx-1',
      originAccountId: 'acc-1',
      destAccountId: 'acc-2',
      amount: '100.00',
      commission: '2.00',
      authorizationCode: 'REAL123CODE',
      status: 'COMPLETED',
      createdAt: '2026-08-28T00:00:00.000Z',
    });
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent).toContain('REAL123CODE');
    expect((destInput as HTMLInputElement).value).toBe('');
    expect((amountInput as HTMLInputElement).value).toBe('');

    // El éxito re-despacha loadMyAccount (refresca el saldo) — hace falta
    // responder ese segundo request antes de poder afirmar sobre el saldo
    // ya actualizado en pantalla.
    httpMock.expectOne((r) => r.url === 'accounts/me').flush([
      {
        id: 'acc-1',
        accountNumber: '1000000001',
        balance: '796.00',
        accountType: 'BASIC',
        status: 'ACTIVE',
        avatarUrl: null,
      },
    ]);
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent).toContain('796.00');
  });

  it('defensa en profundidad: montado sin roleGuard, un 403 real del backend al transferir no rompe la página', async () => {
    // Monta el container solo, en una ruta SIN roleGuard, simulando
    // exactamente el escenario que RolesGuard del backend ya cubre en
    // RBAC — ej. el rol cambió server-side a mitad de sesión.
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'transfer-unguarded', component: TransferFormPage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideStore({}),
        provideState(myAccountFeature),
        provideState(transferFeature),
        provideEffects([MyAccountEffects, TransferEffects]),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);

    const harness = await RouterTestingHarness.create('/transfer-unguarded');

    httpMock.expectOne((r) => r.url === 'accounts/me').flush([
      {
        id: 'acc-1',
        accountNumber: '1000000001',
        balance: '898.00',
        accountType: 'BASIC',
        status: 'ACTIVE',
        avatarUrl: null,
      },
    ]);
    await harness.fixture.whenStable();
    harness.detectChanges();

    const destInput = harness.routeDebugElement!.query(By.css('input[formControlName=destAccountId]'))
      .nativeElement as HTMLInputElement;
    const amountInput = harness.routeDebugElement!.query(By.css('input[formControlName=amount]'))
      .nativeElement as HTMLInputElement;
    destInput.value = 'acc-2';
    destInput.dispatchEvent(new Event('input'));
    amountInput.value = '50.00';
    amountInput.dispatchEvent(new Event('input'));
    harness.detectChanges();

    harness.routeDebugElement!.query(By.css('form')).triggerEventHandler('ngSubmit', undefined);

    httpMock
      .expectOne((r) => r.url === 'transactions/transfer')
      .flush(
        { statusCode: 403, message: 'Forbidden resource', error: 'Forbidden' },
        { status: 403, statusText: 'Forbidden' },
      );
    await harness.fixture.whenStable();
    harness.detectChanges();

    const banner = harness.routeDebugElement!.query(By.css('main > .error-banner'));
    expect(banner.nativeElement.textContent).toContain('Forbidden resource');
    // Se maneja como cualquier otro error (tarea 7): sin retry (403 no está
    // en la lista de códigos reintentables) y el form conserva los datos.
    expect(banner.query(By.css('button'))).toBeFalsy();
    expect(destInput.value).toBe('acc-2');
  });
});
