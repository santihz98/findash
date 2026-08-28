import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { of } from 'rxjs';
import { catchError, exhaustMap, map, switchMap, tap } from 'rxjs/operators';

import { AuthService } from '../../core/services/auth.service';
import { TokenStorageService } from '../../core/services/token-storage.service';
import { extractErrorMessage } from '../../core/utils/extract-error-message.util';
import { authActions } from './auth.actions';
import { selectRefreshToken } from './auth.reducer';

@Injectable()
export class AuthEffects {
  private readonly actions$ = inject(Actions);
  private readonly authService = inject(AuthService);
  private readonly tokenStorage = inject(TokenStorageService);
  private readonly router = inject(Router);
  private readonly store = inject(Store);

  /**
   * Login -> POST /auth/login -> GET /auth/me con el accessToken recién
   * obtenido (explícito, no vía el interceptor: en este punto el store
   * todavía no tiene el token — ver AuthService.me()). Un fallo en
   * cualquiera de los dos pasos termina en loginFailure con el mensaje del
   * backend tal cual (tarea 7).
   */
  login$ = createEffect(() =>
    this.actions$.pipe(
      ofType(authActions.login),
      switchMap(({ email, password }) =>
        this.authService.login(email, password).pipe(
          switchMap(({ accessToken, refreshToken }) =>
            this.authService.me(accessToken).pipe(
              map((user) => authActions.loginSuccess({ user, accessToken, refreshToken })),
              catchError((error: HttpErrorResponse) =>
                of(
                  authActions.loginFailure({
                    error: extractErrorMessage(error, 'No se pudo obtener el perfil del usuario.'),
                  }),
                ),
              ),
            ),
          ),
          catchError((error: HttpErrorResponse) =>
            of(
              authActions.loginFailure({
                error: extractErrorMessage(error, 'Credenciales inválidas'),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  persistTokensOnLogin$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(authActions.loginSuccess, authActions.restoreSessionSuccess),
        tap(({ accessToken, refreshToken }) =>
          this.tokenStorage.setTokens(accessToken, refreshToken),
        ),
      ),
    { dispatch: false },
  );

  persistAccessTokenOnRefresh$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(authActions.refreshTokenSuccess),
        tap(({ accessToken }) => this.tokenStorage.setAccessToken(accessToken)),
      ),
    { dispatch: false },
  );

  navigateAfterLogin$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(authActions.loginSuccess),
        tap(({ user }) => {
          // Decisión de UX (documentada en PROGRESS.md): ADMIN aterriza en
          // el listado de cuentas (RF-03/04, Sesión 2), CLIENT en su propia
          // cuenta/transferencias — cada rol va directo a la pantalla que
          // le corresponde, sin pasar por una home genérica.
          this.router.navigateByUrl(user.role === 'ADMIN' ? '/accounts' : '/transfer');
        }),
      ),
    { dispatch: false },
  );

  /**
   * `logout` (explícito, ej. botón de logout) y `refreshTokenFailure`
   * (refresh fallido — la sesión ya no es válida, ver jwt.interceptor.ts)
   * terminan igual: limpiar tokens persistidos y volver a /login.
   * `restoreSessionFailure` NO entra acá a propósito — correr al arrancar
   * la app para un visitante anónimo (sin sesión previa) no debe forzar
   * una redirección, ver el effect de abajo.
   */
  logout$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(authActions.logout, authActions.refreshTokenFailure),
        tap(() => {
          this.tokenStorage.clear();
          this.router.navigateByUrl('/login');
        }),
      ),
    { dispatch: false },
  );

  clearStorageOnRestoreFailure$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(authActions.restoreSessionFailure),
        tap(() => this.tokenStorage.clear()),
      ),
    { dispatch: false },
  );

  /**
   * Dispara la llamada real a POST /auth/refresh — `jwt.interceptor.ts`
   * solo despacha `refreshToken` y escucha el resultado por el stream de
   * `Actions`, nunca llama a `AuthService` directamente (mismo criterio de
   * "un solo lugar con HttpClient" para todo lo de auth). `exhaustMap` (no
   * `switchMap`/`mergeMap`) es la pieza que dedupea refreshes concurrentes:
   * si dos requests en paralelo disparan un 401 casi al mismo tiempo, la
   * segunda `refreshToken` despachada mientras la primera todavía está en
   * vuelo se ignora — ambos requests originales terminan escuchando el
   * mismo resultado de la única llamada real a /auth/refresh.
   */
  refreshToken$ = createEffect(() =>
    this.actions$.pipe(
      ofType(authActions.refreshToken),
      exhaustMap(() => {
        const refreshToken = this.store.selectSignal(selectRefreshToken)();
        if (!refreshToken) {
          return of(authActions.refreshTokenFailure());
        }
        return this.authService.refresh(refreshToken).pipe(
          map(({ accessToken }) => authActions.refreshTokenSuccess({ accessToken })),
          catchError(() => of(authActions.refreshTokenFailure())),
        );
      }),
    ),
  );

  /**
   * Chequeo de sesión persistida al arrancar la app (ver AuthState.sessionRestoring
   * y app.ts, que despacha `restoreSession` en el constructor de `App` —
   * garantizado a correr después de que `ConfigService` ya cargó
   * `assets/config.json`, porque `App` no se construye hasta que el
   * `provideAppInitializer` de config resuelve). Sin tokens guardados, no
   * hay nada que restaurar — resuelve directo a restoreSessionFailure sin
   * pegarle al backend.
   *
   * Si /auth/me falla (el access token guardado dura 15 min, ver
   * backend token.service.ts — muy plausible que ya haya expirado en un
   * refresh de página), se intenta refrescar **acá mismo**, no vía
   * `jwt.interceptor.ts`: en este punto el store todavía no tiene el
   * `refreshToken` (es justo lo que esta acción está por poblar), así que
   * el interceptor no tendría de dónde sacarlo. Un solo intento — si el
   * refresh también falla (refresh token vencido a los 7 días, o inválido),
   * se da la sesión por perdida.
   */
  restoreSession$ = createEffect(() =>
    this.actions$.pipe(
      ofType(authActions.restoreSession),
      switchMap(() => {
        const accessToken = this.tokenStorage.readAccessToken();
        const refreshToken = this.tokenStorage.readRefreshToken();

        if (!accessToken || !refreshToken) {
          return of(authActions.restoreSessionFailure());
        }

        return this.authService.me(accessToken).pipe(
          map((user) => authActions.restoreSessionSuccess({ user, accessToken, refreshToken })),
          catchError(() =>
            this.authService.refresh(refreshToken).pipe(
              switchMap(({ accessToken: freshAccessToken }) =>
                this.authService.me(freshAccessToken).pipe(
                  map((user) =>
                    authActions.restoreSessionSuccess({
                      user,
                      accessToken: freshAccessToken,
                      refreshToken,
                    }),
                  ),
                ),
              ),
              catchError(() => of(authActions.restoreSessionFailure())),
            ),
          ),
        );
      }),
    ),
  );
}
