import { Component, effect, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { distinctUntilChanged } from 'rxjs/operators';

import { TransactionStatus } from '../../../state/transactionsAudit/transactions-audit.model';

export interface TransactionAuditFilters {
  status: TransactionStatus | '';
  /** 'YYYY-MM-DD' (valor crudo de `<input type="date">`) o `''`. */
  dateFrom: string;
  dateTo: string;
}

/**
 * "Dumb", mismo patrón que `AccountFiltersComponent` (Sesión 14): nunca
 * dispara un fetch ni conoce el Store. Sin debounce en ningún campo — a
 * diferencia del documento (texto libre) de `AccountFiltersComponent`, acá
 * los 3 campos son de selección discreta (`select`/`date`), así que cada
 * cambio ya es una decisión completa del usuario, no una tecla suelta.
 *
 * El ajuste de "fin de día" para `dateTo` (ver backend Swagger: solo fecha
 * = 00:00:00 UTC) NO vive acá — este componente emite el valor crudo del
 * input (`'YYYY-MM-DD'`), tal como lo tipeó el usuario. La conversión
 * ocurre en `TransactionsAuditPage.parseQuery()`, el mismo lugar donde
 * `AccountListPage.parseQuery()` ya hace transformaciones equivalentes
 * (URL -> query real) — mantiene este componente ignorante de esa regla de
 * negocio, y a la URL con el valor legible que el usuario tipeó
 * (bookmarkeable tal cual).
 */
@Component({
  selector: 'app-transaction-audit-filters',
  imports: [ReactiveFormsModule],
  template: `
    <form class="transaction-audit-filters" [formGroup]="form">
      <label class="field">
        Estado
        <select formControlName="status">
          <option value="">Todos</option>
          <option value="COMPLETED">Completada</option>
          <option value="REJECTED">Rechazada</option>
          <option value="FAILED">Fallida</option>
        </select>
      </label>

      <label class="field">
        Desde
        <input type="date" formControlName="dateFrom" />
      </label>

      <label class="field">
        Hasta
        <input type="date" formControlName="dateTo" />
      </label>
    </form>
  `,
  styles: `
    .transaction-audit-filters {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: var(--space-4);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: var(--space-4);
    }

    .transaction-audit-filters .field {
      flex: 1;
      min-width: 10rem;
    }

    @media (max-width: 640px) {
      .transaction-audit-filters {
        flex-direction: column;
        align-items: stretch;
      }

      .transaction-audit-filters .field {
        min-width: 0;
      }
    }
  `,
})
export class TransactionAuditFiltersComponent {
  status = input<TransactionStatus | ''>('');
  dateFrom = input('');
  dateTo = input('');
  filtersChange = output<TransactionAuditFilters>();

  private readonly formBuilder = inject(FormBuilder);

  readonly form = this.formBuilder.nonNullable.group({
    status: [''] as [TransactionStatus | ''],
    dateFrom: [''],
    dateTo: [''],
  });

  constructor() {
    effect(() => {
      this.form.patchValue(
        { status: this.status(), dateFrom: this.dateFrom(), dateTo: this.dateTo() },
        { emitEvent: false },
      );
    });

    this.form.controls.status.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.emitChange());
    this.form.controls.dateFrom.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.emitChange());
    this.form.controls.dateTo.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.emitChange());
  }

  private emitChange(): void {
    const { status, dateFrom, dateTo } = this.form.getRawValue();
    this.filtersChange.emit({ status: status as TransactionStatus | '', dateFrom, dateTo });
  }
}
