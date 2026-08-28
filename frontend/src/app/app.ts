import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Store } from '@ngrx/store';

import { authActions } from './state/auth/auth.actions';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly store = inject(Store);

  constructor() {
    // Despachado acá (no vía ROOT_EFFECTS_INIT) porque `App` no se
    // construye hasta que `provideAppConfigInitializer` resuelve — así se
    // garantiza que ConfigService.apiUrl ya está listo cuando
    // AuthEffects.restoreSession$ dispare la llamada a GET /auth/me, sin
    // depender del orden (no garantizado) en que Angular corre distintos
    // APP_INITIALIZER. Ver PROGRESS.md.
    this.store.dispatch(authActions.restoreSession());
  }
}
