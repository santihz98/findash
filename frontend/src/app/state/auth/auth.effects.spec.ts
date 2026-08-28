import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideMockActions } from '@ngrx/effects/testing';
import { Store } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { Subject, firstValueFrom, of, throwError } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { TokenStorageService } from '../../core/services/token-storage.service';
import { authActions } from './auth.actions';
import { AuthEffects } from './auth.effects';
import { CurrentUser, initialAuthState } from './auth.model';

const user: CurrentUser = {
  id: 'user-1',
  email: 'basic@findash.dev',
  documentNumber: '1010000002',
  role: 'CLIENT',
};

describe('AuthEffects', () => {
  let actions$: Subject<unknown>;
  let authService: {
    login: ReturnType<typeof vi.fn>;
    me: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
  };
  let tokenStorage: {
    setTokens: ReturnType<typeof vi.fn>;
    setAccessToken: ReturnType<typeof vi.fn>;
    readAccessToken: ReturnType<typeof vi.fn>;
    readRefreshToken: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };

  function setup(): AuthEffects {
    actions$ = new Subject();
    authService = { login: vi.fn(), me: vi.fn(), refresh: vi.fn() };
    tokenStorage = {
      setTokens: vi.fn(),
      setAccessToken: vi.fn(),
      readAccessToken: vi.fn().mockReturnValue(null),
      readRefreshToken: vi.fn().mockReturnValue(null),
      clear: vi.fn(),
    };
    router = { navigateByUrl: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        AuthEffects,
        provideMockActions(() => actions$),
        provideMockStore({ initialState: { auth: initialAuthState } }),
        { provide: AuthService, useValue: authService },
        { provide: TokenStorageService, useValue: tokenStorage },
        { provide: Router, useValue: router },
      ],
    });

    return TestBed.inject(AuthEffects);
  }

  describe('login$', () => {
    it('dispatches loginSuccess with the resolved user after a successful login + /auth/me', async () => {
      const effects = setup();
      authService.login.mockReturnValue(of({ accessToken: 'access-1', refreshToken: 'refresh-1' }));
      authService.me.mockReturnValue(of(user));

      const result = firstValueFrom(effects.login$);
      actions$.next(authActions.login({ email: user.email, password: 'Demo1234!' }));

      expect(await result).toEqual(
        authActions.loginSuccess({ user, accessToken: 'access-1', refreshToken: 'refresh-1' }),
      );
      expect(authService.me).toHaveBeenCalledWith('access-1');
    });

    it('dispatches loginFailure with the backend message when POST /auth/login rejects', async () => {
      const effects = setup();
      authService.login.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({ status: 401, error: { message: 'Credenciales inválidas' } }),
        ),
      );

      const result = firstValueFrom(effects.login$);
      actions$.next(authActions.login({ email: user.email, password: 'wrong' }));

      expect(await result).toEqual(authActions.loginFailure({ error: 'Credenciales inválidas' }));
    });

    it('dispatches loginFailure when login succeeds but GET /auth/me fails', async () => {
      const effects = setup();
      authService.login.mockReturnValue(of({ accessToken: 'access-1', refreshToken: 'refresh-1' }));
      authService.me.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 401, error: {} })),
      );

      const result = firstValueFrom(effects.login$);
      actions$.next(authActions.login({ email: user.email, password: 'x' }));

      expect(await result).toEqual(
        authActions.loginFailure({ error: 'No se pudo obtener el perfil del usuario.' }),
      );
    });
  });

  describe('persistTokensOnLogin$', () => {
    it('persists both tokens on loginSuccess', async () => {
      const effects = setup();
      const result = firstValueFrom(effects.persistTokensOnLogin$);
      actions$.next(authActions.loginSuccess({ user, accessToken: 'a', refreshToken: 'r' }));
      await result;
      expect(tokenStorage.setTokens).toHaveBeenCalledWith('a', 'r');
    });
  });

  describe('persistAccessTokenOnRefresh$', () => {
    it('persists only the access token on refreshTokenSuccess', async () => {
      const effects = setup();
      const result = firstValueFrom(effects.persistAccessTokenOnRefresh$);
      actions$.next(authActions.refreshTokenSuccess({ accessToken: 'fresh-access' }));
      await result;
      expect(tokenStorage.setAccessToken).toHaveBeenCalledWith('fresh-access');
    });
  });

  describe('navigateAfterLogin$', () => {
    it('navigates ADMIN users to /accounts', async () => {
      const effects = setup();
      const result = firstValueFrom(effects.navigateAfterLogin$);
      actions$.next(
        authActions.loginSuccess({
          user: { ...user, role: 'ADMIN' },
          accessToken: 'a',
          refreshToken: 'r',
        }),
      );
      await result;
      expect(router.navigateByUrl).toHaveBeenCalledWith('/accounts');
    });

    it('navigates CLIENT users to /transfer', async () => {
      const effects = setup();
      const result = firstValueFrom(effects.navigateAfterLogin$);
      actions$.next(authActions.loginSuccess({ user, accessToken: 'a', refreshToken: 'r' }));
      await result;
      expect(router.navigateByUrl).toHaveBeenCalledWith('/transfer');
    });
  });

  describe('logout$', () => {
    it('clears storage and navigates to /login on explicit logout', async () => {
      const effects = setup();
      const result = firstValueFrom(effects.logout$);
      actions$.next(authActions.logout());
      await result;
      expect(tokenStorage.clear).toHaveBeenCalled();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
    });

    it('also clears storage and navigates to /login when a refresh ultimately fails', async () => {
      const effects = setup();
      const result = firstValueFrom(effects.logout$);
      actions$.next(authActions.refreshTokenFailure());
      await result;
      expect(tokenStorage.clear).toHaveBeenCalled();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
    });
  });

  describe('refreshToken$', () => {
    // `setState` (no `overrideSelector`) a propósito: `overrideSelector`
    // fuerza el resultado mutando el memoize del selector compartido
    // (`selector.setResult(...)`), lo que sobrevive más allá de esta
    // instancia de MockStore y puede filtrarse a otros tests que importen
    // el mismo `selectRefreshToken`. `setState` solo toca el árbol de
    // estado de esta instancia — sin ese riesgo de fuga entre tests.
    it('dispatches refreshTokenSuccess when POST /auth/refresh succeeds', async () => {
      const effects = setup();
      const store = TestBed.inject(Store) as MockStore;
      store.setState({ auth: { ...initialAuthState, refreshToken: 'refresh-1' } });
      authService.refresh.mockReturnValue(of({ accessToken: 'fresh-access' }));

      const result = firstValueFrom(effects.refreshToken$);
      actions$.next(authActions.refreshToken());

      expect(await result).toEqual(
        authActions.refreshTokenSuccess({ accessToken: 'fresh-access' }),
      );
      expect(authService.refresh).toHaveBeenCalledWith('refresh-1');
    });

    it('dispatches refreshTokenFailure when POST /auth/refresh rejects', async () => {
      const effects = setup();
      const store = TestBed.inject(Store) as MockStore;
      store.setState({ auth: { ...initialAuthState, refreshToken: 'refresh-1' } });
      authService.refresh.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 401, error: {} })),
      );

      const result = firstValueFrom(effects.refreshToken$);
      actions$.next(authActions.refreshToken());

      expect(await result).toEqual(authActions.refreshTokenFailure());
    });

    it('dispatches refreshTokenFailure without calling the backend when there is no stored refresh token', async () => {
      const effects = setup();
      const store = TestBed.inject(Store) as MockStore;
      store.setState({ auth: { ...initialAuthState, refreshToken: null } });

      const result = firstValueFrom(effects.refreshToken$);
      actions$.next(authActions.refreshToken());

      expect(await result).toEqual(authActions.refreshTokenFailure());
      expect(authService.refresh).not.toHaveBeenCalled();
    });
  });

  describe('restoreSession$', () => {
    it('resolves directly to restoreSessionFailure when there are no stored tokens', async () => {
      const effects = setup();
      tokenStorage.readAccessToken.mockReturnValue(null);
      tokenStorage.readRefreshToken.mockReturnValue(null);

      const result = firstValueFrom(effects.restoreSession$);
      actions$.next(authActions.restoreSession());

      expect(await result).toEqual(authActions.restoreSessionFailure());
      expect(authService.me).not.toHaveBeenCalled();
    });

    it('resolves to restoreSessionSuccess when the stored access token is still valid', async () => {
      const effects = setup();
      tokenStorage.readAccessToken.mockReturnValue('access-1');
      tokenStorage.readRefreshToken.mockReturnValue('refresh-1');
      authService.me.mockReturnValue(of(user));

      const result = firstValueFrom(effects.restoreSession$);
      actions$.next(authActions.restoreSession());

      expect(await result).toEqual(
        authActions.restoreSessionSuccess({
          user,
          accessToken: 'access-1',
          refreshToken: 'refresh-1',
        }),
      );
    });

    it('refreshes once and retries /auth/me when the stored access token expired', async () => {
      const effects = setup();
      tokenStorage.readAccessToken.mockReturnValue('expired-access');
      tokenStorage.readRefreshToken.mockReturnValue('refresh-1');
      authService.me
        .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 401, error: {} })))
        .mockReturnValueOnce(of(user));
      authService.refresh.mockReturnValue(of({ accessToken: 'fresh-access' }));

      const result = firstValueFrom(effects.restoreSession$);
      actions$.next(authActions.restoreSession());

      expect(await result).toEqual(
        authActions.restoreSessionSuccess({
          user,
          accessToken: 'fresh-access',
          refreshToken: 'refresh-1',
        }),
      );
      expect(authService.me).toHaveBeenNthCalledWith(1, 'expired-access');
      expect(authService.me).toHaveBeenNthCalledWith(2, 'fresh-access');
    });

    it('resolves to restoreSessionFailure when both /auth/me and the refresh fail', async () => {
      const effects = setup();
      tokenStorage.readAccessToken.mockReturnValue('expired-access');
      tokenStorage.readRefreshToken.mockReturnValue('expired-refresh');
      authService.me.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 401, error: {} })),
      );
      authService.refresh.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 401, error: {} })),
      );

      const result = firstValueFrom(effects.restoreSession$);
      actions$.next(authActions.restoreSession());

      expect(await result).toEqual(authActions.restoreSessionFailure());
    });
  });

  describe('clearStorageOnRestoreFailure$', () => {
    it('clears persisted tokens (but does not navigate) on restoreSessionFailure', async () => {
      const effects = setup();
      const result = firstValueFrom(effects.clearStorageOnRestoreFailure$);
      actions$.next(authActions.restoreSessionFailure());
      await result;
      expect(tokenStorage.clear).toHaveBeenCalled();
      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });
  });
});
