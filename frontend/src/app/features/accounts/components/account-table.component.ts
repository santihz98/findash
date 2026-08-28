import { Component, input, output } from '@angular/core';

import { Account } from '../../../state/accounts/accounts.model';
import { AccountAvatarComponent } from './account-avatar.component';

/**
 * "Dumb" (RNF-03/ARCHITECTURE.md sección 4): solo @Input()/@Output(),
 * cero conocimiento del Store ni de HttpClient, cero lógica de fetching.
 * La paginación vive acá (footer de la tabla) porque conceptualmente es
 * parte de "cómo se presentan los datos ya cargados", no de "cómo se
 * cargan" — el container es quien decide qué hacer con `pageChange`
 * (actualizar la URL, que dispara el fetch real).
 */
@Component({
  selector: 'app-account-table',
  imports: [AccountAvatarComponent],
  template: `
    <div class="account-table-card">
      <div class="account-table-scroll">
        <table class="account-table" [class.refetching]="refetching()">
          <thead>
            <tr>
              <th scope="col"></th>
              <th scope="col">Cuenta</th>
              <th scope="col">Titular</th>
              <th scope="col">Documento</th>
              <th scope="col">Tipo</th>
              <th scope="col">Saldo</th>
              <th scope="col">Estado</th>
            </tr>
          </thead>
          <tbody>
            @for (account of accounts(); track account.id) {
              <tr>
                <td>
                  <app-account-avatar
                    [avatarUrl]="account.avatarUrl"
                    [alt]="'Avatar de ' + account.email"
                  />
                </td>
                <td class="account-table__mono">{{ account.accountNumber }}</td>
                <td>{{ account.email }}</td>
                <td class="account-table__mono">{{ account.documentNumber }}</td>
                <td>
                  <span class="account-type-badge account-type-badge--{{ account.accountType }}">{{
                    account.accountType
                  }}</span>
                </td>
                <td class="account-table__balance">{{ account.balance }}</td>
                <td>
                  <span class="status-dot status-dot--{{ account.status }}">
                    {{ account.status === 'ACTIVE' ? 'Activa' : 'Bloqueada' }}
                  </span>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <div class="pagination" role="navigation" aria-label="Paginación de cuentas">
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
    .account-table-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-sm);
      overflow: hidden;
    }

    .account-table-scroll {
      overflow-x: auto;
    }

    .account-table {
      width: 100%;
      min-width: 42rem;
      border-collapse: collapse;
      transition: opacity 0.15s ease;
    }

    .account-table.refetching {
      opacity: 0.6;
    }

    .account-table th {
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

    .account-table td {
      padding: var(--space-3) var(--space-4);
      border-bottom: 1px solid var(--color-border);
      font-size: var(--fs-sm);
    }

    .account-table tbody tr:last-child td {
      border-bottom: none;
    }

    .account-table tbody tr:hover td {
      background: var(--color-surface-sunken);
    }

    .account-table__mono {
      font-variant-numeric: tabular-nums;
      color: var(--color-ink-muted);
    }

    .account-table__balance {
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    .account-type-badge {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      padding: var(--space-1) var(--space-3);
      border-radius: var(--radius-full);
      background: var(--color-surface-sunken);
      color: var(--color-ink-muted);
      border: 1px solid var(--color-border-strong);
    }

    .account-type-badge--PREMIUM {
      background: var(--color-primary-soft);
      color: var(--color-primary);
      border-color: var(--color-primary-soft-border);
    }

    .account-type-badge--CORPORATE {
      background: var(--color-info-soft);
      color: var(--color-info);
      border-color: var(--color-info-soft-border);
    }

    .status-dot {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--fs-sm);
      font-weight: 600;
    }

    .status-dot::before {
      content: '';
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 50%;
      background: var(--color-ink-faint);
    }

    .status-dot--ACTIVE {
      color: var(--color-success);
    }

    .status-dot--ACTIVE::before {
      background: var(--color-success);
    }

    .status-dot--BLOCKED {
      color: var(--color-danger);
    }

    .status-dot--BLOCKED::before {
      background: var(--color-danger);
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
export class AccountTableComponent {
  accounts = input.required<Account[]>();
  page = input.required<number>();
  totalPages = input.required<number>();
  /** true mientras se refresca una tabla que ya tenía datos — ver la decisión de UX en PROGRESS.md (no se limpia la tabla, se atenúa). */
  refetching = input(false);

  pageChange = output<number>();
}
