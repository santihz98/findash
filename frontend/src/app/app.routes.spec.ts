import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideMockStore } from '@ngrx/store/testing';

import { routes } from './app.routes';
import { initialAccountsState } from './state/accounts/accounts.model';
import { CurrentUser, initialAuthState } from './state/auth/auth.model';
import { initialMyAccountState } from './state/myAccount/my-account.model';
import { initialTransferState } from './state/transfer/transfer.model';

const adminUser: CurrentUser = {
  id: 'user-1',
  email: 'admin@findash.dev',
  documentNumber: '1010000001',
  role: 'ADMIN',
};

const clientUser: CurrentUser = { ...adminUser, id: 'user-2', role: 'CLIENT' };

describe('routes', () => {
  it('lazy-loads HomePage on the root path', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideMockStore({ initialState: { auth: initialAuthState } }),
      ],
    });

    const harness = await RouterTestingHarness.create('/');

    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain(
      'FinDash — en construcción',
    );
  });

  it('lazy-loads LoginPage on /login', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideMockStore({ initialState: { auth: initialAuthState } }),
      ],
    });

    const harness = await RouterTestingHarness.create('/login');

    expect(harness.routeNativeElement?.querySelector('form')).toBeTruthy();
  });

  it('lazy-loads AccountListPage on /accounts for an authenticated ADMIN', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideMockStore({
          initialState: {
            auth: { ...initialAuthState, accessToken: 'a', user: adminUser },
            accounts: initialAccountsState,
          },
        }),
      ],
    });

    const harness = await RouterTestingHarness.create('/accounts');

    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain('Cuentas');
  });

  it('redirects /accounts to /login for an unauthenticated visitor', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideMockStore({ initialState: { auth: initialAuthState } }),
      ],
    });

    await RouterTestingHarness.create('/accounts');

    expect(TestBed.inject(Router).url).toBe('/login');
  });

  it('lazy-loads TransferFormPage on /transfer for an authenticated CLIENT', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideMockStore({
          initialState: {
            auth: { ...initialAuthState, accessToken: 'a', user: clientUser },
            myAccount: initialMyAccountState,
            transfer: initialTransferState,
          },
        }),
      ],
    });

    const harness = await RouterTestingHarness.create('/transfer');

    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain(
      'Transferir dinero',
    );
  });

  it('redirects a CLIENT away from /accounts to their own safe route', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideMockStore({
          initialState: {
            auth: { ...initialAuthState, accessToken: 'a', user: clientUser },
            myAccount: initialMyAccountState,
            transfer: initialTransferState,
          },
        }),
      ],
    });

    const harness = await RouterTestingHarness.create('/accounts');

    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain(
      'Transferir dinero',
    );
  });
});
