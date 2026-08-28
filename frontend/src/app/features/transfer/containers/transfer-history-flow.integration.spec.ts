import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideEffects } from '@ngrx/effects';
import { Store, provideState, provideStore } from '@ngrx/store';

import { routes } from '../../../app.routes';
import { CurrentUser } from '../../../state/auth/auth.model';
import { authFeature } from '../../../state/auth/auth.reducer';
import { AccountsEffects } from '../../../state/accounts/accounts.effects';
import { accountsFeature } from '../../../state/accounts/accounts.reducer';
import { MyTransactionsEffects } from '../../../state/myTransactions/my-transactions.effects';
import { myTransactionsFeature } from '../../../state/myTransactions/my-transactions.reducer';
import { TransactionsAuditEffects } from '../../../state/transactionsAudit/transactions-audit.effects';
import { transactionsAuditFeature } from '../../../state/transactionsAudit/transactions-audit.reducer';

const clientUser: CurrentUser = {
  id: 'user-2',
  email: 'basic@findash.dev',
  documentNumber: '1010000002',
  role: 'CLIENT',
};

const adminUser: CurrentUser = { ...clientUser, id: 'user-1', email: 'admin@findash.dev', role: 'ADMIN' };

/**
 * Test de integración real (tarea 12): Store + MyTransactionsEffects/
 * TransactionsAuditEffects + Router + guards reales, sin mocks de NgRx. El
 * único doble es `HttpTestingController`.
 */
describe('transfer history flow (integración real, backend fake)', () => {
  let httpMock: HttpTestingController;

  function configure(user: CurrentUser): void {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideStore({}),
        provideState(authFeature),
        provideState(myTransactionsFeature),
        // Registrados (con sus effects) para que un ADMIN redirigido a
        // /accounts, o un CLIENT redirigido a /transfer/no aplica acá
        // (mismo criterio que account-list-flow.integration.spec.ts): el
        // ADMIN sin acceso a /transfer/history cae en /accounts.
        provideState(accountsFeature),
        provideState(transactionsAuditFeature),
        provideEffects([MyTransactionsEffects, AccountsEffects, TransactionsAuditEffects]),
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

  it('loads the paginated history from the URL and renders SENT/RECEIVED rows distinguishably', async () => {
    configure(clientUser);
    const harness = await RouterTestingHarness.create('/transfer/history?page=1&limit=20');

    const req = httpMock.expectOne(
      (r) => r.url === 'transactions/me' && r.params.get('page') === '1' && r.params.get('limit') === '20',
    );
    req.flush({
      data: [
        {
          id: 'tx-1',
          originAccountId: 'acc-1',
          destAccountId: 'acc-2',
          amount: '100.00',
          commission: '2.00',
          authorizationCode: 'AUTHCODE1',
          status: 'COMPLETED',
          createdAt: '2026-08-27T16:05:41.540Z',
          direction: 'SENT',
          counterpartyAccount: { accountNumber: '1000000002', accountType: 'PREMIUM' },
        },
        {
          id: 'tx-2',
          originAccountId: 'acc-3',
          destAccountId: 'acc-1',
          amount: '25.00',
          commission: '0.50',
          authorizationCode: 'AUTHCODE2',
          status: 'COMPLETED',
          createdAt: '2026-08-27T10:00:00.000Z',
          direction: 'RECEIVED',
          counterpartyAccount: { accountNumber: '1000000003', accountType: 'CORPORATE' },
        },
      ],
      page: 1,
      limit: 20,
      total: 2,
      totalPages: 1,
    });

    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent).toContain('Enviada');
    expect(harness.routeNativeElement?.textContent).toContain('Recibida');
    expect(harness.routeNativeElement?.textContent).toContain('AUTHCODE1');
    expect(harness.routeNativeElement?.textContent).toContain('AUTHCODE2');
    // Sesión 27: la contraparte se muestra por accountNumber/accountType real, nunca su email
    // (acotado a la tabla: la barra superior sí muestra el email del propio usuario logueado).
    const tableText = harness.routeNativeElement?.querySelector('app-transaction-table')?.textContent ?? '';
    expect(tableText).toContain('1000000002');
    expect(tableText).toContain('PREMIUM');
    expect(tableText).toContain('1000000003');
    expect(tableText).toContain('CORPORATE');
    expect(tableText).not.toContain('@');
  });

  it('shows the 422 NoOriginAccountException message via the same error-banner pattern, without crashing the page', async () => {
    configure(clientUser);
    const harness = await RouterTestingHarness.create('/transfer/history');

    httpMock.expectOne((r) => r.url === 'transactions/me').flush(
      {
        statusCode: 422,
        error: 'NoOriginAccountException',
        message: 'No se encontró una única cuenta de origen para este usuario',
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await harness.fixture.whenStable();
    harness.detectChanges();

    const banner = harness.routeDebugElement!.query(By.css('.error-banner'));
    expect(banner.nativeElement.textContent).toContain(
      'No se encontró una única cuenta de origen para este usuario',
    );
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain(
      'Historial de movimientos',
    );
  });

  it('clicking next page updates the URL and triggers a new request for that page', async () => {
    configure(clientUser);
    const harness = await RouterTestingHarness.create('/transfer/history?page=1&limit=1');
    const row = {
      id: 'tx-1',
      originAccountId: 'acc-1',
      destAccountId: 'acc-2',
      amount: '10.00',
      commission: '0.20',
      authorizationCode: 'AUTHCODE1',
      status: 'COMPLETED',
      createdAt: '2026-08-27T16:05:41.540Z',
      direction: 'SENT',
      counterpartyAccount: { accountNumber: '1000000002', accountType: 'PREMIUM' },
    };

    httpMock
      .expectOne((r) => r.url === 'transactions/me' && r.params.get('page') === '1')
      .flush({ data: [row], page: 1, limit: 1, total: 2, totalPages: 2 });
    await harness.fixture.whenStable();
    harness.detectChanges();

    const nextButton = harness.routeDebugElement!.queryAll(By.css('.pagination button'))[1];
    nextButton.nativeElement.click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    httpMock
      .expectOne((r) => r.url === 'transactions/me' && r.params.get('page') === '2')
      .flush({ data: [{ ...row, id: 'tx-2' }], page: 2, limit: 1, total: 2, totalPages: 2 });
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(TestBed.inject(Router).url).toContain('page=2');
    expect(harness.routeNativeElement?.textContent).toContain('Página 2 de 2');
  });

  it('an ADMIN navigating directly to /transfer/history never reaches the component (roleGuard redirects to /accounts)', async () => {
    configure(adminUser);
    const harness = await RouterTestingHarness.create('/transfer/history');

    expect(TestBed.inject(Router).url).toBe('/accounts');
    httpMock.expectNone((r) => r.url === 'transactions/me');
    // /accounts dispara su propia carga real (roleGuard lo dejó pasar de verdad).
    httpMock
      .expectOne((r) => r.url === 'accounts')
      .flush({ data: [], page: 1, limit: 20, total: 0, totalPages: 0 });
  });
});
