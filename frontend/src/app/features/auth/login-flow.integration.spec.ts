import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideEffects } from '@ngrx/effects';
import { Store, provideState, provideStore } from '@ngrx/store';

import { routes } from '../../app.routes';
import { jwtInterceptor } from '../../core/interceptors/jwt.interceptor';
import { TokenStorageService } from '../../core/services/token-storage.service';
import { AuthEffects } from '../../state/auth/auth.effects';
import { authFeature, selectError } from '../../state/auth/auth.reducer';

/**
 * Test de integración real (tarea 14): Store + AuthEffects + AuthService +
 * Router + AuthGuard/RoleGuard "de verdad" (sin mocks de NgRx), el único
 * doble usado es HttpTestingController — un backend fake, nunca el de AWS.
 * Cubre el flujo de punta a punta: submit del form -> POST /auth/login ->
 * GET /auth/me -> tokens persistidos en localStorage real -> navegación por
 * rol -> la ruta protegida siguiente efectivamente renderiza.
 */
describe('login flow (integración real, backend fake)', () => {
  let httpMock: HttpTestingController;

  function configure(): void {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClient(withInterceptors([jwtInterceptor])),
        provideHttpClientTesting(),
        provideStore({}),
        provideState(authFeature),
        provideEffects([AuthEffects]),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  }

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('logs an ADMIN in end-to-end and lands on the guarded /accounts route', async () => {
    configure();
    const harness = await RouterTestingHarness.create('/login');

    const emailInput = harness.routeDebugElement!.query(By.css('input[type=email]'))
      .nativeElement as HTMLInputElement;
    const passwordInput = harness.routeDebugElement!.query(By.css('input[type=password]'))
      .nativeElement as HTMLInputElement;
    emailInput.value = 'admin@findash.dev';
    emailInput.dispatchEvent(new Event('input'));
    passwordInput.value = 'Demo1234!';
    passwordInput.dispatchEvent(new Event('input'));
    harness.detectChanges();

    harness.routeDebugElement!.query(By.css('form')).triggerEventHandler('ngSubmit', undefined);

    const loginReq = httpMock.expectOne('auth/login');
    expect(loginReq.request.body).toEqual({ email: 'admin@findash.dev', password: 'Demo1234!' });
    loginReq.flush({ accessToken: 'fake-access', refreshToken: 'fake-refresh' });

    const meReq = httpMock.expectOne('auth/me');
    expect(meReq.request.headers.get('Authorization')).toBe('Bearer fake-access');
    meReq.flush({
      id: 'user-1',
      email: 'admin@findash.dev',
      documentNumber: '1010000001',
      role: 'ADMIN',
    });

    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(TestBed.inject(Router).url).toBe('/accounts');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain('Cuentas');

    const tokenStorage = TestBed.inject(TokenStorageService);
    expect(tokenStorage.readAccessToken()).toBe('fake-access');
    expect(tokenStorage.readRefreshToken()).toBe('fake-refresh');
  });

  it('shows the exact backend error message on invalid credentials and does not navigate away from /login', async () => {
    configure();
    const harness = await RouterTestingHarness.create('/login');
    const store = TestBed.inject(Store);

    const emailInput = harness.routeDebugElement!.query(By.css('input[type=email]'))
      .nativeElement as HTMLInputElement;
    const passwordInput = harness.routeDebugElement!.query(By.css('input[type=password]'))
      .nativeElement as HTMLInputElement;
    emailInput.value = 'admin@findash.dev';
    emailInput.dispatchEvent(new Event('input'));
    passwordInput.value = 'wrong-password';
    passwordInput.dispatchEvent(new Event('input'));
    harness.detectChanges();

    harness.routeDebugElement!.query(By.css('form')).triggerEventHandler('ngSubmit', undefined);

    const loginReq = httpMock.expectOne('auth/login');
    loginReq.flush(
      { statusCode: 401, message: 'Credenciales inválidas', error: 'Unauthorized' },
      { status: 401, statusText: 'Unauthorized' },
    );

    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(TestBed.inject(Router).url).toBe('/login');
    let error: string | null = null;
    store.select(selectError).subscribe((e) => (error = e));
    expect(error).toBe('Credenciales inválidas');
    expect(harness.routeNativeElement?.querySelector('.login-error')?.textContent).toContain(
      'Credenciales inválidas',
    );
  });

  it('a CLIENT logging in lands on /transfer instead of /accounts', async () => {
    configure();
    const harness = await RouterTestingHarness.create('/login');

    const emailInput = harness.routeDebugElement!.query(By.css('input[type=email]'))
      .nativeElement as HTMLInputElement;
    const passwordInput = harness.routeDebugElement!.query(By.css('input[type=password]'))
      .nativeElement as HTMLInputElement;
    emailInput.value = 'basic@findash.dev';
    emailInput.dispatchEvent(new Event('input'));
    passwordInput.value = 'Demo1234!';
    passwordInput.dispatchEvent(new Event('input'));
    harness.detectChanges();

    harness.routeDebugElement!.query(By.css('form')).triggerEventHandler('ngSubmit', undefined);

    httpMock
      .expectOne('auth/login')
      .flush({ accessToken: 'fake-access', refreshToken: 'fake-refresh' });
    httpMock.expectOne('auth/me').flush({
      id: 'user-2',
      email: 'basic@findash.dev',
      documentNumber: '1010000002',
      role: 'CLIENT',
    });

    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(TestBed.inject(Router).url).toBe('/transfer');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain(
      'transferencias',
    );
  });
});
