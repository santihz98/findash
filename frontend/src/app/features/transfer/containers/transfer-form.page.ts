import { Component } from '@angular/core';

/**
 * Placeholder de aterrizaje post-login para CLIENT (ver auth.effects.ts,
 * navigateAfterLogin$) — el formulario real de transferencias es una
 * sesión futura, todavía no implementada. Existe acá solo para que la
 * ruta protegida por roleGuard(['CLIENT']) tenga algo que renderizar y el
 * flujo de login sea verificable de punta a punta en esta sesión.
 */
@Component({
  selector: 'app-transfer-form-page',
  template: `<h1>Mi cuenta / transferencias (pendiente)</h1>`,
})
export class TransferFormPage {}
