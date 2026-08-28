import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Store } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { Subject } from 'rxjs';

import { authActions } from '../../state/auth/auth.actions';
import { AuthState, initialAuthState } from '../../state/auth/auth.model';
import { jwtInterceptor } from './jwt.interceptor';

describe('jwtInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;
  let store: MockStore;
  let mockActions$: Subject<unknown>;

  function setup(authOverrides: Partial<AuthState> = {}): void {
    mockActions$ = new Subject();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([jwtInterceptor])),
        provideHttpClientTesting(),
        provideMockStore({ initialState: { auth: { ...initialAuthState, ...authOverrides } } }),
        provideMockActions(() => mockActions$),
      ],
    });

    httpClient = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    store = TestBed.inject(Store) as MockStore;
  }

  afterEach(() => {
    httpMock.verify();
  });

  it('attaches the Bearer header when there is an active session', () => {
    setup({ accessToken: 'access-1' });

    httpClient.get('http://api.test/accounts').subscribe();

    const req = httpMock.expectOne('http://api.test/accounts');
    expect(req.request.headers.get('Authorization')).toBe('Bearer access-1');
    req.flush({});
  });

  it('does not attach a header when there is no session', () => {
    setup();

    httpClient.get('http://api.test/accounts').subscribe();

    const req = httpMock.expectOne('http://api.test/accounts');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('leaves an already-present Authorization header untouched (ej. AuthService.me() durante login)', () => {
    setup({ accessToken: 'store-token' });

    httpClient
      .get('http://api.test/auth/me', { headers: { Authorization: 'Bearer explicit-token' } })
      .subscribe();

    const req = httpMock.expectOne('http://api.test/auth/me');
    expect(req.request.headers.get('Authorization')).toBe('Bearer explicit-token');
    req.flush({});
  });

  it('passes through non-401 errors untouched, without dispatching anything', () => {
    setup({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    let capturedError: HttpErrorResponse | undefined;

    httpClient.get('http://api.test/accounts').subscribe({ error: (err) => (capturedError = err) });

    const req = httpMock.expectOne('http://api.test/accounts');
    req.flush({ message: 'boom' }, { status: 500, statusText: 'Internal Server Error' });

    expect(capturedError?.status).toBe(500);
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('on 401 with a stored refresh token, refreshes once and retries the original request', () => {
    setup({ accessToken: 'expired-access', refreshToken: 'refresh-1' });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    let result: unknown;

    httpClient.get('http://api.test/accounts').subscribe({ next: (res) => (result = res) });

    const firstReq = httpMock.expectOne('http://api.test/accounts');
    firstReq.flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    expect(dispatchSpy).toHaveBeenCalledWith(authActions.refreshToken());

    // Simula lo que AuthEffects.refreshToken$ despacharía tras un
    // POST /auth/refresh exitoso.
    mockActions$.next(authActions.refreshTokenSuccess({ accessToken: 'new-access' }));

    const retriedReq = httpMock.expectOne('http://api.test/accounts');
    expect(retriedReq.request.headers.get('Authorization')).toBe('Bearer new-access');
    retriedReq.flush({ ok: true });

    expect(result).toEqual({ ok: true });
  });

  it('on 401, propagates the original error when the refresh also fails (AuthEffects.logout$ maneja la limpieza)', () => {
    setup({ accessToken: 'expired-access', refreshToken: 'refresh-1' });
    let capturedError: HttpErrorResponse | undefined;

    httpClient.get('http://api.test/accounts').subscribe({ error: (err) => (capturedError = err) });

    const firstReq = httpMock.expectOne('http://api.test/accounts');
    firstReq.flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    mockActions$.next(authActions.refreshTokenFailure());

    expect(capturedError).toBeInstanceOf(HttpErrorResponse);
    expect(capturedError?.status).toBe(401);
  });

  it('on 401 with no refresh token stored, dispatches logout directly without attempting a refresh', () => {
    setup({ accessToken: 'expired-access', refreshToken: null });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    let capturedError: HttpErrorResponse | undefined;

    httpClient.get('http://api.test/accounts').subscribe({ error: (err) => (capturedError = err) });

    const req = httpMock.expectOne('http://api.test/accounts');
    req.flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    expect(dispatchSpy).toHaveBeenCalledWith(authActions.logout());
    expect(capturedError?.status).toBe(401);
  });

  it('never tries to refresh a 401 coming from /auth/login or /auth/refresh itself', () => {
    setup();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    let capturedError: HttpErrorResponse | undefined;

    httpClient
      .post('http://api.test/auth/login', { email: 'x', password: 'y' })
      .subscribe({ error: (err) => (capturedError = err) });

    const req = httpMock.expectOne('http://api.test/auth/login');
    req.flush({ message: 'Credenciales inválidas' }, { status: 401, statusText: 'Unauthorized' });

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(capturedError?.status).toBe(401);
  });
});
