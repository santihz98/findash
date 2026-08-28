import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Actions, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { Observable, throwError } from 'rxjs';
import { catchError, switchMap, take } from 'rxjs/operators';

import { authActions } from '../../state/auth/auth.actions';
import { selectAccessToken, selectRefreshToken } from '../../state/auth/auth.reducer';

/**
 * Distinto de `apiConfigInterceptor` (ese resuelve la URL base) — este
 * agrega `Authorization: Bearer <token>` a cada request saliente que tenga
 * sesión activa, y ante un 401 intenta refrescar el access token una única
 * vez antes de reintentar el request original. No llama a
 * `AuthService`/`HttpClient` directamente para el refresh: despacha
 * `refreshToken` y espera el resultado por el stream de `Actions` — la
 * llamada real vive en `AuthEffects.refreshToken$` (único lugar con
 * `HttpClient` para todo lo de auth, RNF-03 extendido al interceptor). Si
 * el refresh también falla, `AuthEffects.logout$` ya se encarga de limpiar
 * tokens y redirigir a /login — el interceptor solo propaga el error
 * original para que el caller (ej. un effect) sepa que el request no se
 * pudo completar.
 */
export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(Store);
  const actions$ = inject(Actions);

  const accessToken = store.selectSignal(selectAccessToken)();
  const authReq = attachToken(req, accessToken);

  return next(authReq).pipe(
    catchError((error: unknown) => {
      if (
        !(error instanceof HttpErrorResponse) ||
        error.status !== 401 ||
        isAuthEndpoint(req.url)
      ) {
        return throwError(() => error);
      }

      const hasRefreshToken = !!store.selectSignal(selectRefreshToken)();
      if (!hasRefreshToken) {
        store.dispatch(authActions.logout());
        return throwError(() => error);
      }

      store.dispatch(authActions.refreshToken());

      return actions$.pipe(
        ofType(authActions.refreshTokenSuccess, authActions.refreshTokenFailure),
        take(1),
        switchMap((result): Observable<HttpEvent<unknown>> => {
          if (result.type === authActions.refreshTokenSuccess.type) {
            const retriedReq = attachToken(req, result.accessToken);
            return next(retriedReq);
          }
          // refreshTokenFailure: AuthEffects.logout$ ya limpia tokens y
          // navega a /login. Acá solo se propaga el 401 original.
          return throwError(() => error);
        }),
      );
    }),
  );
};

function attachToken(req: HttpRequest<unknown>, accessToken: string | null): HttpRequest<unknown> {
  if (!accessToken || req.headers.has('Authorization')) {
    return req;
  }
  return req.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } });
}

function isAuthEndpoint(url: string): boolean {
  return /\/auth\/(login|refresh)(\?|$)/.test(url);
}
