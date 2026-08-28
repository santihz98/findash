import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideEffects } from '@ngrx/effects';
import { Store, provideState, provideStore } from '@ngrx/store';

import { routes } from '../../../app.routes';
import { CurrentUser, initialAuthState } from '../../../state/auth/auth.model';
import { authFeature } from '../../../state/auth/auth.reducer';
import { AccountsEffects } from '../../../state/accounts/accounts.effects';
import { accountsFeature } from '../../../state/accounts/accounts.reducer';
import { myAccountFeature } from '../../../state/myAccount/my-account.reducer';
import { transferFeature } from '../../../state/transfer/transfer.reducer';
import { AccountListPage } from './account-list.page';

const adminUser: CurrentUser = {
  id: 'user-1',
  email: 'admin@findash.dev',
  documentNumber: '1010000001',
  role: 'ADMIN',
};

const clientUser: CurrentUser = { ...adminUser, id: 'user-2', role: 'CLIENT' };

/**
 * Test de integración real (tarea 10): Store + AccountsEffects + Router +
 * guards reales, sin mocks de NgRx. El único doble es
 * `HttpTestingController` — un backend fake, nunca el de AWS.
 */
describe('account list flow (integración real, backend fake)', () => {
  let httpMock: HttpTestingController;

  function configure(user: CurrentUser): void {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideStore({}),
        provideState(authFeature),
        provideState(accountsFeature),
        // Registrados (sin sus effects) para que TransferFormPage no
        // crashee cuando el test de CLIENT redirige a /transfer — mismo
        // motivo documentado en login-flow.integration.spec.ts.
        provideState(myAccountFeature),
        provideState(transferFeature),
        provideEffects([AccountsEffects]),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(Store);
    store.dispatch({
      type: '[Auth] Login Success',
      user,
      accessToken: 'fake-access',
      refreshToken: 'fake-refresh',
    });
  }

  afterEach(() => httpMock.verify());

  it('loads combined filters + pagination from the URL and sends them to the backend', async () => {
    configure(adminUser);
    const harness = await RouterTestingHarness.create(
      '/accounts?page=2&limit=20&documentNumber=101&status=ACTIVE',
    );

    const req = httpMock.expectOne(
      (r) =>
        r.url === 'accounts' &&
        r.params.get('page') === '2' &&
        r.params.get('limit') === '20' &&
        r.params.get('documentNumber') === '101' &&
        r.params.get('status') === 'ACTIVE',
    );
    req.flush({
      data: [
        {
          id: 'acc-1',
          accountNumber: '1000000001',
          balance: '979.60',
          accountType: 'BASIC',
          status: 'ACTIVE',
          avatarUrl: null,
          documentNumber: '1010000002',
          email: 'basic@findash.dev',
        },
      ],
      page: 2,
      limit: 20,
      total: 21,
      totalPages: 2,
    });

    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent).toContain('basic@findash.dev');
    expect(harness.routeNativeElement?.textContent).toContain('Página 2 de 2');
  });

  it('clicking next page updates the URL and triggers a new request for that page', async () => {
    configure(adminUser);
    const harness = await RouterTestingHarness.create('/accounts?page=1&limit=20');
    const fakeAccount = {
      id: 'acc-1',
      accountNumber: '1000000001',
      balance: '979.60',
      accountType: 'BASIC',
      status: 'ACTIVE',
      avatarUrl: null,
      documentNumber: '1010000002',
      email: 'basic@findash.dev',
    };

    httpMock
      .expectOne((r) => r.url === 'accounts' && r.params.get('page') === '1')
      .flush({
        data: [fakeAccount],
        page: 1,
        limit: 20,
        total: 40,
        totalPages: 2,
      });
    await harness.fixture.whenStable();
    harness.detectChanges();

    const nextButton = harness.routeDebugElement!.queryAll(By.css('.pagination button'))[1];
    nextButton.nativeElement.click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    httpMock
      .expectOne((r) => r.url === 'accounts' && r.params.get('page') === '2')
      .flush({
        data: [fakeAccount],
        page: 2,
        limit: 20,
        total: 40,
        totalPages: 2,
      });
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(TestBed.inject(Router).url).toContain('page=2');
    expect(harness.routeNativeElement?.textContent).toContain('Página 2 de 2');
  });

  it('a CLIENT navigating directly to /accounts never even reaches the component (roleGuard redirects to /transfer)', async () => {
    configure(clientUser);
    const harness = await RouterTestingHarness.create('/accounts');

    expect(TestBed.inject(Router).url).toBe('/transfer');
    httpMock.expectNone((r) => r.url === 'accounts');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).not.toContain('Cuentas');
  });

  it('defensa en profundidad: si el guard se sortea igual, un 403 real del backend se muestra como error, no rompe la página', async () => {
    // Monta el container solo, en una ruta SIN roleGuard, para simular
    // exactamente el escenario que RolesGuard del backend ya cubre en
    // RBAC: el frontend "cree" que hay sesión, pero el backend igual
    // rechaza (ej. rol cambiado server-side a mitad de sesión).
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'accounts-unguarded', component: AccountListPage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideStore({}),
        provideState(accountsFeature),
        provideEffects([AccountsEffects]),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);

    const harness = await RouterTestingHarness.create('/accounts-unguarded');

    httpMock
      .expectOne((r) => r.url === 'accounts')
      .flush(
        { statusCode: 403, message: 'Forbidden resource', error: 'Forbidden' },
        { status: 403, statusText: 'Forbidden' },
      );

    await harness.fixture.whenStable();
    harness.detectChanges();

    const banner = harness.routeDebugElement!.query(By.css('.error-banner'));
    expect(banner.nativeElement.textContent).toContain('Forbidden resource');
  });
});
