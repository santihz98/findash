import { Component, effect, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Store } from '@ngrx/store';

import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { positiveDecimalAmountValidator } from '../../../shared/validators/positive-decimal-amount.validator';
import { myAccountActions } from '../../../state/myAccount/my-account.actions';
import {
  selectMyAccount,
  selectMyAccountError,
  selectMyAccountIsInitialLoading,
  selectMyAccountIsRefetching,
} from '../../../state/myAccount/my-account.reducer';
import { transferActions } from '../../../state/transfer/transfer.actions';
import { describeTransferError } from '../../../state/transfer/transfer-error.util';
import {
  selectTransferErrorMessage,
  selectTransferErrorStatus,
  selectTransferResult,
  selectTransferSubmitting,
} from '../../../state/transfer/transfer.reducer';

/**
 * Container "smart" (RF-05): saldo propio (`loadMyAccount` al entrar,
 * mismos 3 estados de UX que `AccountListPage` — Sesión 14 — aplicados
 * acá donde tienen sentido: loading inicial vs. refetch, vacío explícito,
 * error con retry sin perder el saldo previo) + formulario reactivo de
 * transferencia.
 *
 * **Decisión — cuenta destino: id crudo, no búsqueda por número de
 * cuenta (tarea 4, explícita a documentar).** Se evaluó agregar un campo
 * "número de cuenta" con una búsqueda que resuelva a un id antes de
 * enviar — pero un CLIENT no tiene ningún endpoint autorizado para
 * resolver esa búsqueda: `GET /accounts` (el único que filtra/lista
 * cuentas) es `@Roles(Role.ADMIN)` (confirmado con curl real: 403 para
 * `basic@findash.dev`), y `GET /accounts/me` solo devuelve las cuentas
 * PROPIAS del usuario autenticado, nunca las de terceros. No existe hoy
 * ningún endpoint que un CLIENT pueda usar para mapear "número de cuenta
 * de otra persona" -> id. Agregar esa búsqueda habría significado
 * inventar un endpoint nuevo en el backend, fuera del alcance de esta
 * sesión (el contrato de `POST /transactions/transfer` ya está cerrado
 * desde la Sesión 4/5/6) — así que el campo pide el id directo, con una
 * ayuda visual explicando qué se espera. Si en el futuro se agrega un
 * endpoint de búsqueda pública/parcial por número de cuenta, este
 * formulario es el punto a revisar.
 */
@Component({
  selector: 'app-transfer-form-page',
  imports: [ReactiveFormsModule, SkeletonLoaderComponent],
  template: `
    <main class="transfer-form-page page-container">
      <h1>Transferir dinero</h1>

      <section class="balance-card" aria-live="polite">
        @if (accountIsInitialLoading()) {
          <app-skeleton-loader [rows]="1" variant="card" />
        } @else {
          @if (accountError()) {
            <div class="error-banner" role="alert">
              <p>{{ accountError() }}</p>
              <button type="button" class="btn btn--secondary" (click)="retryLoadAccount()">
                Reintentar
              </button>
            </div>
          }

          @if (account(); as acc) {
            <div class="balance-card__content" [class.refetching]="accountIsRefetching()">
              <p class="balance-card__label">Cuenta {{ acc.accountNumber }} ({{ acc.accountType }})</p>
              <p class="balance-card__balance">{{ acc.balance }}</p>
            </div>
          } @else if (!accountError()) {
            <p class="empty-state">No tenés ninguna cuenta asociada.</p>
          }
        }
      </section>

      @if (result(); as r) {
        <div class="success-banner" role="status">
          <p>Transferencia realizada con éxito.</p>
          <p>
            Código de autorización: <strong>{{ r.authorizationCode }}</strong>
          </p>
        </div>
      }

      @if (errorPresentation(); as presentation) {
        <div class="error-banner error-banner--{{ presentation.variant }}" role="alert">
          <p class="error-banner__title">
            <span class="error-banner__icon" aria-hidden="true">{{ presentation.icon }}</span>
            {{ presentation.title }}
          </p>
          <p>{{ presentation.message }}</p>
          @if (presentation.helpText) {
            <p class="error-banner__help">{{ presentation.helpText }}</p>
          }
          @if (presentation.retryStrategy !== 'none') {
            <button type="button" class="btn btn--secondary" (click)="retry()">
              {{ presentation.retryLabel }}
            </button>
          }
        </div>
      }

      <form class="transfer-form" [formGroup]="form" (ngSubmit)="submit()">
        <label class="field">
          Cuenta destino (id)
          <input
            type="text"
            formControlName="destAccountId"
            placeholder="id de la cuenta destino"
            [class.is-invalid]="
              form.controls.destAccountId.touched && form.controls.destAccountId.invalid
            "
          />
          @if (
            form.controls.destAccountId.touched && form.controls.destAccountId.hasError('required')
          ) {
            <span class="field-error">La cuenta destino es obligatoria.</span>
          }
        </label>

        <label class="field">
          Monto
          <input
            type="text"
            formControlName="amount"
            placeholder="ej. 100.50"
            [class.is-invalid]="form.controls.amount.touched && form.controls.amount.invalid"
          />
          @if (form.controls.amount.touched && form.controls.amount.hasError('required')) {
            <span class="field-error">El monto es obligatorio.</span>
          }
          @if (form.controls.amount.touched && form.controls.amount.hasError('positiveDecimalAmount')) {
            <span class="field-error"
              >Ingresá un monto positivo con hasta 2 decimales (ej. "100.50").</span
            >
          }
        </label>

        <button
          type="submit"
          class="btn btn--primary"
          [class.btn--loading]="submitting()"
          [disabled]="submitting()"
        >
          {{ submitting() ? 'Verificando la transferencia…' : 'Transferir' }}
        </button>
      </form>
    </main>
  `,
  styles: `
    .balance-card {
      background: linear-gradient(135deg, var(--color-primary), var(--color-primary-active));
      color: var(--color-primary-contrast);
      border-radius: var(--radius-lg);
      padding: var(--space-5);
      box-shadow: var(--shadow-md);
    }

    .balance-card .error-banner {
      background: var(--color-surface);
    }

    .balance-card .empty-state {
      background: rgba(255, 255, 255, 0.12);
      border-color: rgba(255, 255, 255, 0.35);
      color: var(--color-primary-contrast);
    }

    .balance-card__content {
      transition: opacity 0.15s ease;
    }

    .balance-card__content.refetching {
      opacity: 0.6;
    }

    .balance-card__label {
      font-size: var(--fs-sm);
      font-weight: 600;
      opacity: 0.85;
      margin-bottom: var(--space-2);
    }

    .balance-card__balance {
      font-size: 2.5rem;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.02em;
    }

    .transfer-form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      padding: var(--space-5);
      box-shadow: var(--shadow-sm);
    }

    .transfer-form button[type='submit'] {
      align-self: flex-start;
      min-width: 10rem;
    }
  `,
})
export class TransferFormPage {
  private readonly store = inject(Store);
  private readonly formBuilder = inject(FormBuilder);

  readonly account = this.store.selectSignal(selectMyAccount);
  readonly accountError = this.store.selectSignal(selectMyAccountError);
  readonly accountIsInitialLoading = this.store.selectSignal(selectMyAccountIsInitialLoading);
  readonly accountIsRefetching = this.store.selectSignal(selectMyAccountIsRefetching);

  readonly submitting = this.store.selectSignal(selectTransferSubmitting);
  readonly result = this.store.selectSignal(selectTransferResult);
  private readonly errorStatus = this.store.selectSignal(selectTransferErrorStatus);
  private readonly errorMessage = this.store.selectSignal(selectTransferErrorMessage);

  readonly errorPresentation = () => {
    const status = this.errorStatus();
    const message = this.errorMessage();
    return status !== null && message !== null ? describeTransferError(status, message) : null;
  };

  readonly form = this.formBuilder.nonNullable.group({
    destAccountId: ['', [Validators.required]],
    amount: ['', [Validators.required, positiveDecimalAmountValidator]],
  });

  /**
   * Key del intento en curso/último — plain field, NO Store: es estado
   * puramente local del formulario (mismo espíritu que el propio
   * `FormGroup`), necesario para que `retry()` pueda reusar exactamente
   * el mismo valor en el caso 409 (tarea 5/11, ver transfer-error.util.ts).
   */
  private lastIdempotencyKey: string | null = null;

  constructor() {
    this.store.dispatch(myAccountActions.loadMyAccount());

    // Tras una transferencia exitosa: limpiar el formulario y refrescar el
    // saldo (volver a despachar loadMyAccount) — tarea 5, caso 201.
    effect(() => {
      if (this.result()) {
        this.form.reset({ destAccountId: '', amount: '' });
        this.store.dispatch(myAccountActions.loadMyAccount());
      }
    });
  }

  retryLoadAccount(): void {
    this.store.dispatch(myAccountActions.loadMyAccount());
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.dispatchTransfer(crypto.randomUUID());
  }

  retry(): void {
    const presentation = this.errorPresentation();
    if (!presentation) {
      return;
    }
    const idempotencyKey =
      presentation.retryStrategy === 'same-key'
        ? (this.lastIdempotencyKey ?? crypto.randomUUID())
        : crypto.randomUUID();
    this.dispatchTransfer(idempotencyKey);
  }

  private dispatchTransfer(idempotencyKey: string): void {
    this.lastIdempotencyKey = idempotencyKey;
    const { destAccountId, amount } = this.form.getRawValue();
    this.store.dispatch(transferActions.submitTransfer({ destAccountId, amount, idempotencyKey }));
  }
}
