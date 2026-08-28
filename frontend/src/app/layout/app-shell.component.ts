import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Store } from '@ngrx/store';

import { authActions } from '../state/auth/auth.actions';
import { selectCurrentUser } from '../state/auth/auth.reducer';

/**
 * Layout de la app autenticada (Sesión 16): header con identidad del
 * usuario logueado (email + rol) y logout siempre visible, envolviendo un
 * `<router-outlet>` propio — `/accounts`/`/transfer`/`/transfer/history`/
 * `/transactions`/`/dashboard` viven como hijos de este layout en
 * app.routes.ts, así que heredan el header sin que cada página tenga que
 * reimplementarlo. `/` y `/login` quedan fuera a propósito: son pantallas
 * no autenticadas, no tiene sentido mostrar "cerrar sesión" ahí.
 *
 * Nav por rol (Sesión 18 del frontend, RF-02): hasta esta sesión cada rol
 * tenía una única ruta autenticada, así que el guard alcanzaba para
 * "navegar" (login te deja directo ahí). Con una segunda ruta por rol
 * (historial/auditoría) hace falta un link real — mismo criterio que ya
 * diferencia el resto del header por rol (`@if (u.role === ...)`), no un
 * componente de nav nuevo.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="app-shell">
      <header class="app-header">
        <div class="app-header__brand-nav">
          <span class="app-header__brand">FinDash</span>

          @if (user(); as u) {
            <nav class="app-header__nav">
              @if (u.role === 'CLIENT') {
                <a
                  routerLink="/transfer"
                  routerLinkActive="is-active"
                  [routerLinkActiveOptions]="{ exact: true }"
                  >Transferir</a
                >
                <a routerLink="/transfer/history" routerLinkActive="is-active">Historial</a>
              }
              @if (u.role === 'ADMIN') {
                <a routerLink="/accounts" routerLinkActive="is-active">Cuentas</a>
                <a routerLink="/transactions" routerLinkActive="is-active">Auditoría</a>
                <a routerLink="/dashboard" routerLinkActive="is-active">Dashboard</a>
              }
            </nav>
          }
        </div>

        @if (user(); as u) {
          <div class="app-header__user">
            <span class="app-header__identity">
              <span class="app-header__email">{{ u.email }}</span>
              <span class="app-header__role-badge">{{ roleLabel(u.role) }}</span>
            </span>
            <button type="button" class="btn btn--ghost" (click)="logout()">Cerrar sesión</button>
          </div>
        }
      </header>

      <router-outlet />
    </div>
  `,
  styles: `
    .app-shell {
      min-height: 100%;
      display: flex;
      flex-direction: column;
    }

    .app-header {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4);
      height: var(--header-height);
      padding: 0 var(--space-5);
      background: var(--color-surface);
      border-bottom: 1px solid var(--color-border);
      box-shadow: var(--shadow-sm);
    }

    .app-header__brand-nav {
      display: flex;
      align-items: center;
      gap: var(--space-6);
      min-width: 0;
    }

    .app-header__brand {
      font-size: var(--fs-lg);
      font-weight: 800;
      letter-spacing: -0.01em;
      color: var(--color-primary);
      white-space: nowrap;
    }

    .app-header__nav {
      display: flex;
      align-items: center;
      gap: var(--space-4);
      overflow-x: auto;
    }

    .app-header__nav a {
      font-size: var(--fs-sm);
      font-weight: 600;
      color: var(--color-ink-muted);
      text-decoration: none;
      white-space: nowrap;
      padding: var(--space-2) 0;
      border-bottom: 2px solid transparent;
    }

    .app-header__nav a:hover {
      color: var(--color-ink);
    }

    .app-header__nav a.is-active {
      color: var(--color-primary);
      border-bottom-color: var(--color-primary);
    }

    .app-header__user {
      display: flex;
      align-items: center;
      gap: var(--space-4);
    }

    .app-header__identity {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .app-header__email {
      font-size: var(--fs-sm);
      color: var(--color-ink-muted);
    }

    .app-header__role-badge {
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      color: var(--color-primary);
      background: var(--color-primary-soft);
      border: 1px solid var(--color-primary-soft-border);
      border-radius: var(--radius-full);
      padding: var(--space-1) var(--space-3);
    }

    @media (max-width: 640px) {
      .app-header {
        padding: 0 var(--space-3);
      }

      .app-header__email {
        display: none;
      }
    }
  `,
})
export class AppShellComponent {
  private readonly store = inject(Store);

  readonly user = this.store.selectSignal(selectCurrentUser);

  logout(): void {
    this.store.dispatch(authActions.logout());
  }

  roleLabel(role: 'ADMIN' | 'CLIENT'): string {
    return role === 'ADMIN' ? 'Administrador' : 'Cliente';
  }
}
