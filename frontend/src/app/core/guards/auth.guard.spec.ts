import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { Observable } from 'rxjs';

import { AuthState, initialAuthState } from '../../state/auth/auth.model';
import { authGuard } from './auth.guard';

const dummyRoute = {} as ActivatedRouteSnapshot;
const dummyState = {} as RouterStateSnapshot;

@Component({ selector: 'app-test-protected', template: 'protected' })
class ProtectedTestComponent {}

@Component({ selector: 'app-test-login', template: 'login' })
class LoginTestComponent {}

function setup(authOverrides: Partial<AuthState>): { store: MockStore } {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'protected', canActivate: [authGuard], component: ProtectedTestComponent },
        { path: 'login', component: LoginTestComponent },
      ]),
      provideMockStore({ initialState: { auth: { ...initialAuthState, ...authOverrides } } }),
    ],
  });
  return { store: TestBed.inject(MockStore) };
}

describe('authGuard', () => {
  it('allows navigation when there is an active session', async () => {
    setup({ accessToken: 'access-1' });
    const harness = await RouterTestingHarness.create('/protected');
    expect(harness.routeNativeElement?.textContent).toContain('protected');
  });

  it('redirects to /login when there is no active session', async () => {
    setup({ accessToken: null });
    const harness = await RouterTestingHarness.create('/protected');
    expect(harness.routeNativeElement?.textContent).toContain('login');
    expect(TestBed.inject(Router).url).toBe('/login');
  });

  it('does not resolve while sessionRestoring is true, then decides once it flips to false', () => {
    const { store } = setup({ accessToken: null, sessionRestoring: true });

    let resolved: boolean | UrlTree | undefined;
    TestBed.runInInjectionContext(() => {
      const value = authGuard(dummyRoute, dummyState);
      (value as Observable<boolean | UrlTree>).subscribe((v) => (resolved = v));
    });

    expect(resolved).toBeUndefined();

    store.setState({
      auth: { ...initialAuthState, accessToken: 'access-1', sessionRestoring: false },
    });

    expect(resolved).toBe(true);
  });
});
