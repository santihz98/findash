import { Routes } from '@angular/router';

import { roleGuard } from './core/guards/role.guard';

// `roleGuard` ya incluye el chequeo de authGuard (sin sesión -> /login,
// ver core/guards/role.guard.ts) — las dos rutas de abajo requieren un rol
// específico, así que alcanza con roleGuard solo. authGuard queda
// disponible en core/guards/ para una futura ruta que solo necesite "estar
// logueado", sin importar el rol.
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/containers/home.page').then((m) => m.HomePage),
  },
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
    ],
  },
];
