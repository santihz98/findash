import { Component } from '@angular/core';

/**
 * Placeholder de aterrizaje post-login para ADMIN (ver auth.effects.ts,
 * navigateAfterLogin$) — el listado real (RF-03/RF-04, paginado + filtros)
 * es la Sesión 2, todavía no implementada. Existe acá solo para que la
 * ruta protegida por roleGuard(['ADMIN']) tenga algo que renderizar y el
 * flujo de login sea verificable de punta a punta en esta sesión.
 */
@Component({
  selector: 'app-account-list-page',
  template: `<h1>Cuentas — listado (Sesión 2, pendiente)</h1>`,
})
export class AccountListPage {}
