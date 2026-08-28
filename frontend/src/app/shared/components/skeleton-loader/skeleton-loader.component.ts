import { Component, input } from '@angular/core';

/**
 * Se muestra mientras la tabla completa está cargando datos (loading$ del
 * store en `loading && !loaded`, ver AccountsState) — no por cada imagen
 * individual, eso es responsabilidad de ImageFallbackDirective y es un
 * problema distinto (imagen rota vs. datos todavía no llegaron).
 *
 * `variant` (Sesión 16, tarea visual): el fantasma debe parecerse a lo que
 * reemplaza, no ser un bloque gris genérico. `'table'` (default, usado por
 * AccountListPage) dibuja avatar + columnas de texto por fila, imitando
 * `AccountTableComponent`. `'card'` (usado por TransferFormPage para el
 * saldo) dibuja una única barra ancha, imitando `.balance-card`. El conteo
 * de `.skeleton-row` (contrato que ya prueba skeleton-loader.component.spec.ts)
 * no cambia con la variante.
 */
@Component({
  selector: 'app-skeleton-loader',
  template: `
    <div
      class="skeleton-loader"
      [class.skeleton-loader--card]="variant() === 'card'"
      role="status"
      aria-live="polite"
      aria-label="Cargando…"
    >
      @for (row of rowIndexes(); track row) {
        <div class="skeleton-row">
          @if (variant() === 'table') {
            <span class="skeleton-cell skeleton-cell--avatar"></span>
            <span class="skeleton-cell skeleton-cell--text"></span>
            <span class="skeleton-cell skeleton-cell--text"></span>
            <span class="skeleton-cell skeleton-cell--text short"></span>
            <span class="skeleton-cell skeleton-cell--text short"></span>
          } @else {
            <span class="skeleton-cell skeleton-cell--card"></span>
          }
        </div>
      }
    </div>
  `,
})
export class SkeletonLoaderComponent {
  rows = input(5);
  variant = input<'table' | 'card'>('table');

  protected rowIndexes(): number[] {
    return Array.from({ length: this.rows() }, (_, i) => i);
  }
}
