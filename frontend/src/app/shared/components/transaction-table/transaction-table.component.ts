import { DatePipe } from '@angular/common';
import { Component, input, output } from '@angular/core';

/**
 * Shape mínimo que necesita esta tabla — deliberadamente NO importado de
 * `state/myTransactions/` ni de `state/transactionsAudit/`: ambos módulos
 * la usan (`MyTransaction`/`AuditTransaction`, Sesión 18 del frontend), y
 * ninguno de los dos es "el dueño" del otro — importar desde cualquiera de
 * los dos acoplaría ese feature al otro sin necesidad. `MyTransaction`
 * (tiene `direction`) y `AuditTransaction` (no la tiene) son ambos
 * estructuralmente compatibles con esta interfaz vía typing estructural de
 * TypeScript, sin ningún mapeo explícito en los containers.
 */
export interface TransactionRow {
  id: string;
  originAccountId: string;
  destAccountId: string | null;
  amount: string;
  commission: string | null;
  authorizationCode: string | null;
  status: 'COMPLETED' | 'REJECTED' | 'FAILED';
  createdAt: string;
  direction?: 'SENT' | 'RECEIVED';
}

/**
 * "Dumb" (RNF-03), mismo patrón que `AccountTableComponent` (paginación en
 * el footer, `refetching` atenúa en vez de vaciar la tabla). Reusada por
 * `TransferHistoryPage` (CLIENT, `showDirection=true`) y
 * `TransactionsAuditPage` (ADMIN, `showDirection=false`, default) — ver
 * PROGRESS.md Sesión 18 para por qué se comparte esta tabla entre los dos
 * roles en vez de duplicarla (columnas casi idénticas, una sola difiere).
 *
 * Colores deliberadamente separados en dos sistemas que no se pisan:
 * `status-badge` reusa el semáforo verde/rojo/ámbar ya establecido en la
 * Sesión 16 (éxito/error/pendiente) para COMPLETED/REJECTED/FAILED;
 * `direction-badge` usa un par neutro/info (gris/azul) que no es ninguno de
 * esos tres — si usara los mismos colores, una fila "RECEIVED" y una fila
 * "REJECTED" en tonos similares serían difíciles de distinguir de un
 * vistazo, exactamente lo que este esquema evita.
 *
 * `originAccountId`/`destAccountId` se muestran truncados con el id
 * completo en el `title` (tooltip) — el backend no expone un
 * `accountNumber` legible en este payload (solo el `id` UUID), mismo
 * límite ya documentado en `TransferFormPage` (Sesión 15, "cuenta destino:
 * id crudo") para el mismo motivo: no hay ningún endpoint que resuelva
 * UUID -> número de cuenta para quien consulta.
 */
@Component({
  selector: 'app-transaction-table',
  imports: [DatePipe],
  template: `
    <div class="transaction-table-card">
      <div class="transaction-table-scroll">
        <table class="transaction-table" [class.refetching]="refetching()">
          <thead>
            <tr>
              @if (showDirection()) {
                <th scope="col">Dirección</th>
              }
              <th scope="col">Origen</th>
              <th scope="col">Destino</th>
              <th scope="col">Monto</th>
              <th scope="col">Comisión</th>
              <th scope="col">Estado</th>
              <th scope="col">Cód. autorización</th>
              <th scope="col">Fecha</th>
            </tr>
          </thead>
          <tbody>
            @for (t of transactions(); track t.id) {
              <tr>
                @if (showDirection()) {
                  <td>
                    <span class="direction-badge direction-badge--{{ t.direction }}">
                      <span aria-hidden="true">{{ t.direction === 'SENT' ? '↑' : '↓' }}</span>
                      {{ t.direction === 'SENT' ? 'Enviada' : 'Recibida' }}
                    </span>
                  </td>
                }
                <td class="transaction-table__mono" [title]="t.originAccountId">
                  {{ shortId(t.originAccountId) }}
                </td>
                <td class="transaction-table__mono" [title]="t.destAccountId ?? ''">
                  {{ t.destAccountId ? shortId(t.destAccountId) : '—' }}
                </td>
                <td class="transaction-table__amount">{{ t.amount }}</td>
                <td class="transaction-table__amount">{{ t.commission ?? '—' }}</td>
                <td>
                  <span class="status-badge status-badge--{{ t.status }}">{{ statusLabel(t.status) }}</span>
                </td>
                <td class="transaction-table__mono">{{ t.authorizationCode ?? '—' }}</td>
                <td class="transaction-table__date">{{ t.createdAt | date: 'yyyy-MM-dd HH:mm' : 'UTC' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <div class="pagination" role="navigation" aria-label="Paginación de transacciones">
        <button
          type="button"
          class="btn btn--secondary"
          [disabled]="page() <= 1"
          (click)="pageChange.emit(page() - 1)"
        >
          Anterior
        </button>
        <span class="pagination__label">Página {{ page() }} de {{ totalPages() }}</span>
        <button
          type="button"
          class="btn btn--secondary"
          [disabled]="page() >= totalPages()"
          (click)="pageChange.emit(page() + 1)"
        >
          Siguiente
        </button>
      </div>
    </div>
  `,
  styles: `
    .transaction-table-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-sm);
      overflow: hidden;
    }

    .transaction-table-scroll {
      overflow-x: auto;
    }

    .transaction-table {
      width: 100%;
      min-width: 48rem;
      border-collapse: collapse;
      transition: opacity 0.15s ease;
    }

    .transaction-table.refetching {
      opacity: 0.6;
    }

    .transaction-table th {
      text-align: left;
      font-size: var(--fs-sm);
      font-weight: 700;
      color: var(--color-ink-muted);
      text-transform: uppercase;
      letter-spacing: 0.02em;
      padding: var(--space-3) var(--space-4);
      background: var(--color-surface-sunken);
      border-bottom: 1px solid var(--color-border);
    }

    .transaction-table td {
      padding: var(--space-3) var(--space-4);
      border-bottom: 1px solid var(--color-border);
      font-size: var(--fs-sm);
    }

    .transaction-table tbody tr:last-child td {
      border-bottom: none;
    }

    .transaction-table tbody tr:hover td {
      background: var(--color-surface-sunken);
    }

    .transaction-table__mono {
      font-variant-numeric: tabular-nums;
      color: var(--color-ink-muted);
    }

    .transaction-table__amount {
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    .transaction-table__date {
      color: var(--color-ink-muted);
      white-space: nowrap;
    }

    .direction-badge {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      font-size: 0.75rem;
      font-weight: 700;
      padding: var(--space-1) var(--space-3);
      border-radius: var(--radius-full);
      border: 1px solid var(--color-border-strong);
      background: var(--color-surface-sunken);
      color: var(--color-ink-muted);
    }

    .direction-badge--RECEIVED {
      color: var(--color-info);
      background: var(--color-info-soft);
      border-color: var(--color-info-soft-border);
    }

    .status-badge {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      padding: var(--space-1) var(--space-3);
      border-radius: var(--radius-full);
      border: 1px solid var(--color-border-strong);
      background: var(--color-surface-sunken);
      color: var(--color-ink-muted);
    }

    .status-badge--COMPLETED {
      color: var(--color-success);
      background: var(--color-success-soft);
      border-color: var(--color-success-soft-border);
    }

    .status-badge--REJECTED {
      color: var(--color-danger);
      background: var(--color-danger-soft);
      border-color: var(--color-danger-soft-border);
    }

    .status-badge--FAILED {
      color: var(--color-warning);
      background: var(--color-warning-soft);
      border-color: var(--color-warning-soft-border);
    }

    .pagination {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-4);
      padding: var(--space-4);
      border-top: 1px solid var(--color-border);
    }

    .pagination__label {
      font-size: var(--fs-sm);
      color: var(--color-ink-muted);
    }
  `,
})
export class TransactionTableComponent {
  transactions = input.required<TransactionRow[]>();
  page = input.required<number>();
  totalPages = input.required<number>();
  refetching = input(false);
  /** true en `TransferHistoryPage` (CLIENT), false (default) en `TransactionsAuditPage` (ADMIN) — ver el comentario de la clase. */
  showDirection = input(false);

  pageChange = output<number>();

  shortId(id: string): string {
    return id.slice(0, 8);
  }

  statusLabel(status: TransactionRow['status']): string {
    switch (status) {
      case 'COMPLETED':
        return 'Completada';
      case 'REJECTED':
        return 'Rechazada';
      case 'FAILED':
        return 'Fallida';
    }
  }
}
