import { Component, input } from '@angular/core';

import { ImageFallbackDirective } from '../../../shared/directives/image-fallback.directive';

const PLACEHOLDER = 'assets/avatar-placeholder.svg';

/**
 * RF-04, dos casos distintos cubiertos (ver PROGRESS.md):
 * - `avatarUrl` es `null` (sin avatar): se elige el placeholder de
 *   entrada, el `<img>` nunca intenta cargar una URL vacía/inválida.
 * - `avatarUrl` apunta a una URL rota (404, host caído): el `<img>` sí
 *   intenta cargarla, falla, y `ImageFallbackDirective` la reemplaza
 *   reactivamente por el mismo placeholder.
 */
@Component({
  selector: 'app-account-avatar',
  imports: [ImageFallbackDirective],
  template: `<img
    [src]="avatarUrl() ?? placeholder"
    [alt]="alt()"
    appImageFallback
    class="account-avatar"
  />`,
  styles: `
    .account-avatar {
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 50%;
      object-fit: cover;
      border: 1px solid var(--color-border-strong);
      background: var(--color-surface-sunken);
    }
  `,
})
export class AccountAvatarComponent {
  avatarUrl = input<string | null>(null);
  alt = input('Avatar de cuenta');

  protected readonly placeholder = PLACEHOLDER;
}
