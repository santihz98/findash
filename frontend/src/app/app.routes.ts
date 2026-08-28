import { Routes } from '@angular/router';

import { roleGuard } from './core/guards/role.guard';

// `roleGuard` ya incluye el chequeo de authGuard (sin sesión -> /login,
// ver core/guards/role.guard.ts) — las dos rutas de abajo requieren un rol
// específico, así que alcanza con roleGuard solo. authGuard queda
// disponible en core/guards/ para una futura ruta que solo necesite "estar
// logueado", sin importar el rol.
export const routes: Routes = [
  // Sin landing page propia: al arrancar el front (o al visitar '/' sin
  // sesión), se va directo a /login — no hay ningún caso de uso para un
  // visitante anónimo que no sea loguearse.
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  // Layout de la app autenticada (Sesión 16, ver layout/app-shell.component.ts):
  // header con identidad/logout, envolviendo las rutas que sí requieren
  // sesión. `path: ''` con hijos es el patrón estándar de Angular para un
  // layout "shell" — no compite con la Home de arriba porque esta última
  // no tiene hijos, así que solo matchea la URL raíz exacta.
  {
    path: '',
    loadComponent: () => import('./layout/app-shell.component').then((m) => m.AppShellComponent),
    children: [
      {
        path: 'accounts',
        canActivate: [roleGuard(['ADMIN'])],
        loadComponent: () =>
          import('./features/accounts/containers/account-list.page').then(
            (m) => m.AccountListPage,
          ),
      },
      {
        path: 'transfer',
        canActivate: [roleGuard(['CLIENT'])],
        loadComponent: () =>
          import('./features/transfer/containers/transfer-form.page').then(
            (m) => m.TransferFormPage,
          ),
      },
      // RF-02 (Sesión 18 del frontend) — historial de movimientos del
      // CLIENT. Ruta propia, no una sección dentro de /transfer (ver el
      // comentario en transfer-history.page.ts y PROGRESS.md para la
      // justificación completa).
      {
        path: 'transfer/history',
        canActivate: [roleGuard(['CLIENT'])],
        loadComponent: () =>
          import('./features/transfer/containers/transfer-history.page').then(
            (m) => m.TransferHistoryPage,
          ),
      },
      // RF-02 (Sesión 18 del frontend) — auditoría de transacciones, ADMIN.
      {
        path: 'transactions',
        canActivate: [roleGuard(['ADMIN'])],
        loadComponent: () =>
          import('./features/transactions-audit/containers/transactions-audit.page').then(
            (m) => m.TransactionsAuditPage,
          ),
      },
    ],
  },
];
