import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideEffects } from '@ngrx/effects';
import { Store, provideState, provideStore } from '@ngrx/store';

import { routes } from '../../../app.routes';
import { accountLookupFeature } from '../../../state/accountLookup/account-lookup.reducer';
import { CurrentUser } from '../../../state/auth/auth.model';
import { authFeature } from '../../../state/auth/auth.reducer';
import { MyAccountEffects } from '../../../state/myAccount/my-account.effects';
import { myAccountFeature } from '../../../state/myAccount/my-account.reducer';
import { MyTransactionsEffects } from '../../../state/myTransactions/my-transactions.effects';
import { myTransactionsFeature } from '../../../state/myTransactions/my-transactions.reducer';
import { TransactionsAuditEffects } from '../../../state/transactionsAudit/transactions-audit.effects';
import { transactionsAuditFeature } from '../../../state/transactionsAudit/transactions-audit.reducer';
import { TransferEffects } from '../../../state/transfer/transfer.effects';
import { transferFeature } from '../../../state/transfer/transfer.reducer';

const adminUser: CurrentUser = {
  id: 'user-1',
  email: 'admin@findash.dev',
  documentNumber: '1010000001',
  role: 'ADMIN',
};

const clientUser: CurrentUser = { ...adminUser, id: 'user-2', email: 'basic@findash.dev', role: 'CLIENT' };

const row = {
  id: 'tx-1',
  originAccountId: 'acc-1',
  destAccountId: 'acc-2',
  amount: '100.00',
  commission: '2.00',
  authorizationCode: 'AUTHCODE1',
  status: 'REJECTED',
  createdAt: '2026-08-27T16:05:41.540Z',
  originAccount: {
    accountNumber: '1000000001',
    accountType: 'BASIC',
    ownerEmail: 'basic@findash.dev',
    ownerDocumentNumber: '1010000002',
  },
  destAccount: null,
};

/**
 * Test de integración real (tarea 12): Store + TransactionsAuditEffects/
 * MyTransactionsEffects + Router + guards reales, sin mocks de NgRx. El
 * único doble es `HttpTestingController`.
 */
describe('transactions audit flow (integración real, backend fake)', () => {
  let httpMock: HttpTestingController;

  function configure(user: CurrentUser): void {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideStore({}),
        provideState(authFeature),
        provideState(transactionsAuditFeature),
        // Registrados (con sus effects) para que un CLIENT redirigido a
        // /transfer no crashee (mismo criterio que
        // account-list-flow.integration.spec.ts).
        provideState(myAccountFeature),
        provideState(transferFeature),
        provideState(myTransactionsFeature),
        provideState(accountLookupFeature),
        provideEffects([TransactionsAuditEffects, MyAccountEffects, TransferEffects, MyTransactionsEffects]),
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

  it('loads combined status + date filters + pagination from the URL and sends them to the backend', async () => {
    configure(adminUser);
    const harness = await RouterTestingHarness.create(
      '/transactions?page=2&limit=20&status=REJECTED&dateFrom=2026-08-01&dateTo=2026-08-28',
    );

    // dateTo debe llegar al backend con el ajuste de fin de día — no la fecha cruda de la URL.
    const req = httpMock.expectOne(
      (r) =>
        r.url === 'transactions' &&
        r.params.get('page') === '2' &&
        r.params.get('limit') === '20' &&
        r.params.get('status') === 'REJECTED' &&
        r.params.get('dateFrom') === '2026-08-01' &&
        r.params.get('dateTo') === '2026-08-28T23:59:59.999Z',
    );
    req.flush({ data: [row], page: 2, limit: 20, total: 21, totalPages: 2 });

    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent).toContain('AUTHCODE1');
    expect(harness.routeNativeElement?.textContent).toContain('Página 2 de 2');
    // Vista de auditoría: sin columna de dirección (no scopeada a ninguna cuenta).
    expect(harness.routeDebugElement!.query(By.css('.direction-badge'))).toBeFalsy();
    // Sesión 27: la fila real muestra accountNumber/accountType y el email del titular (dato ya disponible para el ADMIN vía GET /accounts).
    expect(harness.routeNativeElement?.textContent).toContain('1000000001');
    expect(harness.routeNativeElement?.textContent).toContain('BASIC');
    expect(harness.routeNativeElement?.textContent).toContain('basic@findash.dev');
  });

  it('changing a filter resets to page 1 and updates the URL + request', async () => {
    configure(adminUser);
    const harness = await RouterTestingHarness.create('/transactions?page=3');

    httpMock
      .expectOne((r) => r.url === 'transactions' && r.params.get('page') === '3')
      .flush({ data: [], page: 3, limit: 20, total: 60, totalPages: 3 });
    await harness.fixture.whenStable();
    harness.detectChanges();

    const select = harness.routeDebugElement!.query(By.css('select')).nativeElement as HTMLSelectElement;
    select.value = 'FAILED';
    select.dispatchEvent(new Event('change'));
    await harness.fixture.whenStable();
    harness.detectChanges();

    httpMock
      .expectOne(
        (r) => r.url === 'transactions' && r.params.get('status') === 'FAILED' && r.params.get('page') === '1',
      )
      .flush({ data: [], page: 1, limit: 20, total: 0, totalPages: 0 });
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(TestBed.inject(Router).url).toContain('status=FAILED');
    expect(TestBed.inject(Router).url).toContain('page=1');
  });

  it('a CLIENT navigating directly to /transactions never even reaches the component (roleGuard redirects to /transfer)', async () => {
    configure(clientUser);
    const harness = await RouterTestingHarness.create('/transactions');

    expect(TestBed.inject(Router).url).toBe('/transfer');
    httpMock.expectNone((r) => r.url === 'transactions');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).not.toContain('Auditoría');

    // /transfer dispara su propia carga real (roleGuard lo dejó pasar de verdad).
    httpMock.expectOne((r) => r.url === 'accounts/me').flush([]);
  });

  it('defensa en profundidad: si el guard se sortea igual, un 403 real del backend se muestra como error, no rompe la página', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'transactions-unguarded', loadComponent: () => import('./transactions-audit.page').then((m) => m.TransactionsAuditPage) },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideStore({}),
        provideState(transactionsAuditFeature),
        provideEffects([TransactionsAuditEffects]),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);

    const harness = await RouterTestingHarness.create('/transactions-unguarded');

    httpMock
      .expectOne((r) => r.url === 'transactions')
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
