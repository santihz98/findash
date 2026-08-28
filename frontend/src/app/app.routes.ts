import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/home/containers/home.page').then((m) => m.HomePage),
  },
];
