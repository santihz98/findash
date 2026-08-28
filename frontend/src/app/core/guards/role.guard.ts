import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { filter, map, take } from 'rxjs/operators';

import { Role } from '../../state/auth/auth.model';
import {
  selectCurrentRole,
  selectIsAuthenticated,
  selectSessionRestoring,
} from '../../state/auth/auth.reducer';

/**
 * Bloquea rutas que requieren uno de `allowedRoles` — parametrizable, ej.
 * `canActivate: [roleGuard(['ADMIN'])]`. Sin sesión activa, redirige a
 * /login (mismo criterio que authGuard, con el mismo chequeo de
 * `sessionRestoring` para no bloquear por una carrera contra el restore de
 * sesión). Con sesión pero sin el rol requerido, redirige a una ruta
 * segura del propio rol del usuario — nunca a un error crudo (tarea 6).
 */
export function roleGuard(allowedRoles: Role[]): CanActivateFn {
  return () => {
    const store = inject(Store);
    const router = inject(Router);

    return store.select(selectSessionRestoring).pipe(
      filter((restoring) => !restoring),
      take(1),
      map(() => {
        if (!store.selectSignal(selectIsAuthenticated)()) {
          return router.createUrlTree(['/login']);
        }

        const role = store.selectSignal(selectCurrentRole)();
        if (role && allowedRoles.includes(role)) {
          return true;
        }

        return router.createUrlTree([safeRouteFor(role)]);
      }),
    );
  };
}

function safeRouteFor(role: Role | null): string {
  if (role === 'ADMIN') {
    return '/accounts';
  }
  if (role === 'CLIENT') {
    return '/transfer';
  }
  return '/login';
}
