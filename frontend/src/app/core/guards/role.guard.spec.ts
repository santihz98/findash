import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { Observable, firstValueFrom } from 'rxjs';

import { AuthState, CurrentUser, initialAuthState } from '../../state/auth/auth.model';
import { roleGuard } from './role.guard';

const dummyRoute = {} as ActivatedRouteSnapshot;
const dummyState = {} as RouterStateSnapshot;

const adminUser: CurrentUser = {
  id: 'user-1',
  email: 'admin@findash.dev',
  documentNumber: '1010000001',
  role: 'ADMIN',
};

const clientUser: CurrentUser = { ...adminUser, id: 'user-2', role: 'CLIENT' };

function setup(authOverrides: Partial<AuthState>): MockStore {
  TestBed.configureTestingModule({
    providers: [
      provideMockStore({ initialState: { auth: { ...initialAuthState, ...authOverrides } } }),
    ],
  });
  return TestBed.inject(MockStore);
}

async function run(allowedRoles: Array<CurrentUser['role']>): Promise<boolean | UrlTree> {
  return TestBed.runInInjectionContext(() =>
    firstValueFrom(
      roleGuard(allowedRoles)(dummyRoute, dummyState) as Observable<boolean | UrlTree>,
    ),
  );
}

describe('roleGuard', () => {
  it('allows navigation when the user has one of the allowed roles', async () => {
    setup({ accessToken: 'access-1', user: adminUser });
    expect(await run(['ADMIN'])).toBe(true);
  });

  it('redirects to /login when there is no active session', async () => {
    setup({ accessToken: null, user: null });
    const result = await run(['ADMIN']);
    expect((result as UrlTree).toString()).toBe('/login');
  });

  it('redirects a CLIENT blocked from an ADMIN-only route to their own safe route, not a raw error', async () => {
    setup({ accessToken: 'access-1', user: clientUser });
    const result = await run(['ADMIN']);
    expect((result as UrlTree).toString()).toBe('/transfer');
  });

  it('redirects an ADMIN blocked from a CLIENT-only route to their own safe route', async () => {
    setup({ accessToken: 'access-1', user: adminUser });
    const result = await run(['CLIENT']);
    expect((result as UrlTree).toString()).toBe('/accounts');
  });

  it('falls back to /login when there is a token but no resolved user/role yet (defensive edge case)', async () => {
    setup({ accessToken: 'access-1', user: null });
    const result = await run(['ADMIN']);
    expect((result as UrlTree).toString()).toBe('/login');
  });

  it('waits for sessionRestoring to finish before deciding', () => {
    const store = setup({ accessToken: null, user: null, sessionRestoring: true });

    let resolved: boolean | UrlTree | undefined;
    TestBed.runInInjectionContext(() => {
      (roleGuard(['ADMIN'])(dummyRoute, dummyState) as Observable<boolean | UrlTree>).subscribe(
        (v) => (resolved = v),
      );
    });

    expect(resolved).toBeUndefined();

    store.setState({
      auth: {
        ...initialAuthState,
        accessToken: 'access-1',
        user: adminUser,
        sessionRestoring: false,
      },
    });

    expect(resolved).toBe(true);
  });
});
