import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { filter, map, take } from 'rxjs/operators';

import { selectIsAuthenticated, selectSessionRestoring } from '../../state/auth/auth.reducer';

/**
 * Bloquea rutas sin sesión activa, redirige a /login. Espera a que
 * `sessionRestoring` (ver auth.model.ts) termine antes de decidir — sin
 * esto, un refresh de página con sesión guardada en localStorage
 * rebotaría a /login por una carrera contra el chequeo de sesión (GET
 * /auth/me) todavía en vuelo.
 */
export const authGuard: CanActivateFn = () => {
  const store = inject(Store);
  const router = inject(Router);

  return store.select(selectSessionRestoring).pipe(
    filter((restoring) => !restoring),
    take(1),
    map(() => store.selectSignal(selectIsAuthenticated)()),
    map((isAuthenticated) => isAuthenticated || router.createUrlTree(['/login'])),
  );
};
