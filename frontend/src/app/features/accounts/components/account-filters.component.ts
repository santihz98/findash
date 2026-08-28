import { Component, effect, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { AccountStatus } from '../../../state/accounts/accounts.model';

export interface AccountFilters {
  documentNumber: string;
  status: AccountStatus | '';
}

/**
 * "Dumb": emite `filtersChange` cuando el usuario cambia algo, nunca
 * dispara un fetch ni conoce el Store. El debounce del documento vive acá
 * (es timing de UI — "no un request por cada tecla" — no lógica de
 * negocio) para que el container no tenga que saber nada de RxJS: recibe
 * un evento ya "listo para navegar", no una tecla por vez.
 *
 * `documentNumber`/`status` de entrada (desde la URL, ver
 * account-list.page.ts) sincronizan el form sin re-emitir `filtersChange`
 * (`emitEvent: false`) — evita el loop "la URL cambia -> el form se
 * actualiza -> el form emite -> la URL cambia otra vez".
 */
@Component({
  selector: 'app-account-filters',
  imports: [ReactiveFormsModule],
  template: `
    <form class="account-filters" [formGroup]="form">
      <label class="field">
        Documento
        <input type="text" formControlName="documentNumber" placeholder="Buscar por documento…" />
      </label>

      <label class="field account-filters__status">
        Estado
        <select formControlName="status">
          <option value="">Todos</option>
          <option value="ACTIVE">Activa</option>
          <option value="BLOCKED">Bloqueada</option>
        </select>
      </label>
    </form>
  `,
  styles: `
    .account-filters {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: var(--space-4);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: var(--space-4);
    }

    .account-filters .field {
      flex: 1;
      min-width: 12rem;
    }

    .account-filters__status {
      flex: 0 0 12rem;
      min-width: 10rem;
    }

    @media (max-width: 640px) {
      .account-filters {
        flex-direction: column;
        align-items: stretch;
      }

      .account-filters .field,
      .account-filters__status {
        min-width: 0;
      }
    }
  `,
})
export class AccountFiltersComponent {
  documentNumber = input('');
  status = input<AccountStatus | ''>('');
  filtersChange = output<AccountFilters>();

  private readonly formBuilder = inject(FormBuilder);

  readonly form = this.formBuilder.nonNullable.group({
    documentNumber: [''],
    status: [''] as [AccountStatus | ''],
  });

  constructor() {
    effect(() => {
      this.form.patchValue(
        { documentNumber: this.documentNumber(), status: this.status() },
        { emitEvent: false },
      );
    });

    this.form.controls.documentNumber.valueChanges
      .pipe(debounceTime(400), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.emitChange());

    this.form.controls.status.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.emitChange());
  }

  private emitChange(): void {
    const { documentNumber, status } = this.form.getRawValue();
    this.filtersChange.emit({ documentNumber, status: status as AccountStatus | '' });
  }
}
