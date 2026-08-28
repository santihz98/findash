import { Component, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Store } from '@ngrx/store';

import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { generateUuid } from '../../../shared/utils/uuid.util';
import { positiveDecimalAmountValidator } from '../../../shared/validators/positive-decimal-amount.validator';
import { accountLookupActions } from '../../../state/accountLookup/account-lookup.actions';
import {
  selectAccountLookupError,
  selectAccountLookupLoading,
  selectAccountLookupRequestedAccountNumber,
  selectAccountLookupResult,
} from '../../../state/accountLookup/account-lookup.reducer';
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
 * **Decisión — cuenta destino: número de cuenta legible, resuelto a `id`
 * vía `GET /accounts/lookup` (Sesión 20, backend Sesión 19, reemplaza la
 * decisión de la Sesión 15 documentada más abajo).** Hasta esta sesión el
 * campo pedía el `id` (UUID) crudo porque no existía ningún endpoint que
 * un CLIENT pudiera usar para resolver "número de cuenta de un tercero" ->
 * id — un bloqueante real de UX/producto (ver PROGRESS.md Sesión 19): en
 * ningún punto de la aplicación un CLIENT llega a ver el UUID de una cuenta
 * ajena, así que el formulario era funcionalmente inutilizable para un
 * usuario real. Con `GET /accounts/lookup?accountNumber=XXXX` (cualquier
 * rol autenticado, `{ id, accountNumber, accountType }`, 404 si no existe)
 * ese bloqueante se cierra: el usuario tipea el número, el formulario
 * resuelve el `id` por su cuenta y lo usa para el POST real — el contrato
 * de `POST /transactions/transfer` (`destAccountId` UUID) no cambió.
 *
 * **Cuándo se resuelve — on-blur, no solo al submit (tarea 2 de la
 * sesión, decisión documentada):** se eligió resolver al salir del campo
 * (`(blur)`) en vez de esperar al submit porque el enunciado mismo señala
 * el beneficio real de esa opción — mostrar una confirmación visual antes
 * de mover dinero ("vas a transferir a una cuenta CORPORATE"), que reduce
 * el riesgo de transferir al número equivocado sin que el usuario se dé
 * cuenta hasta ver el resultado. Además queda un fallback defensivo en
 * `submit()`: si por lo que sea el blur nunca disparó la resolución para el
 * valor actual del campo (ej. el usuario pega el número y aprieta Enter sin
 * que el campo llegue a perder el foco — el comportamiento exacto de
 * submit-por-Enter varía entre navegadores), `submit()` dispara la
 * resolución en ese momento y completa el envío real recién cuando
 * responde (ver el segundo `effect()` del constructor) — nunca se llega a
 * hacer `POST /transactions/transfer` con un `id` que no corresponda
 * exactamente al número que el usuario tiene tipeado.
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
          Número de cuenta destino
          <input
            type="text"
            formControlName="destAccountNumber"
            placeholder="ej. 1000000002"
            (blur)="onDestAccountNumberBlur()"
            [class.is-invalid]="
              (form.controls.destAccountNumber.touched && form.controls.destAccountNumber.invalid) ||
              (isLookupCurrent(destAccountNumberValue()) && !!lookupError())
            "
          />
          @if (
            form.controls.destAccountNumber.touched &&
            form.controls.destAccountNumber.hasError('required')
          ) {
            <span class="field-error">La cuenta destino es obligatoria.</span>
          }
          @if (isLookupCurrent(destAccountNumberValue())) {
            @if (lookupLoading()) {
              <span class="lookup-status lookup-status--loading">Resolviendo cuenta destino…</span>
            } @else if (lookupError(); as lookupErr) {
              <span class="lookup-status lookup-status--error field-error">{{ lookupErr }}</span>
            } @else if (lookupResult(); as resolved) {
              <span class="lookup-status lookup-status--success">
                Vas a transferir a una cuenta <strong>{{ resolved.accountType }}</strong>.
              </span>
            }
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
          [disabled]="submitting() || form.invalid || lookupLoading()"
        >
          {{
            submitting()
              ? 'Verificando la transferencia…'
              : lookupLoading()
                ? 'Resolviendo cuenta destino…'
                : 'Transferir'
          }}
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

    .lookup-status {
      display: block;
      font-size: var(--fs-sm);
      margin-top: var(--space-1);
    }

    .lookup-status--loading {
      color: var(--color-ink-muted);
    }

    .lookup-status--success {
      color: var(--color-success);
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

  readonly lookupResult = this.store.selectSignal(selectAccountLookupResult);
  readonly lookupLoading = this.store.selectSignal(selectAccountLookupLoading);
  readonly lookupError = this.store.selectSignal(selectAccountLookupError);
  readonly lookupRequestedFor = this.store.selectSignal(selectAccountLookupRequestedAccountNumber);

  readonly form = this.formBuilder.nonNullable.group({
    destAccountNumber: ['', [Validators.required]],
    amount: ['', [Validators.required, positiveDecimalAmountValidator]],
  });

  /**
   * Valor actual del campo, como signal real (`toSignal` sobre
   * `valueChanges`) — a diferencia de otros `form.controls.x.value` leídos
   * directo en templates de este proyecto (ver PROGRESS.md Sesión 18), acá
   * SÍ hace falta un signal de verdad: el template lo usa dentro de la
   * condición de un `@if` (para decidir si mostrar el bloque de
   * confirmación/error de la resolución), y leer el `.value` mutable
   * directo ahí producía `NG0100` (el valor podía diferir entre la pasada
   * de chequeo y la de `checkNoChanges` de Angular en modo dev) — un signal
   * real no tiene ese problema porque solo cambia ante una emisión real de
   * `valueChanges`, nunca "espontáneamente" entre las dos pasadas de un
   * mismo `detectChanges()`.
   */
  private readonly rawDestAccountNumber = toSignal(
    this.form.controls.destAccountNumber.valueChanges,
    { initialValue: this.form.controls.destAccountNumber.value },
  );
  readonly destAccountNumberValue = () => this.rawDestAccountNumber().trim();

  /** true si la resolución en el Store corresponde EXACTAMENTE al valor tipeado ahora mismo. */
  readonly isLookupCurrent = (accountNumber: string) =>
    accountNumber.length > 0 && this.lookupRequestedFor() === accountNumber;

  /**
   * Key del intento en curso/último — plain field, NO Store: es estado
   * puramente local del formulario (mismo espíritu que el propio
   * `FormGroup`), necesario para que `retry()` pueda reusar exactamente
   * el mismo valor en el caso 409 (tarea 5/11, ver transfer-error.util.ts).
   */
  private lastIdempotencyKey: string | null = null;
  /** `id` real (UUID) ya resuelto que usó el último intento — `retry()` reusa este, nunca vuelve a resolver. */
  private lastDestAccountId: string | null = null;

  /**
   * Señal de "hay un submit esperando a que termine una resolución
   * disparada por el propio submit()" — tiene que ser un signal (no un
   * campo plano) para que el `effect()` de abajo, que la lee, vuelva a
   * correr cuando cambia (los `effect()` de Angular solo reaccionan a
   * señales leídas dentro de su cuerpo).
   */
  private readonly pendingSubmit = signal(false);

  constructor() {
    this.store.dispatch(myAccountActions.loadMyAccount());

    // Tras una transferencia exitosa: limpiar el formulario y refrescar el
    // saldo (volver a despachar loadMyAccount) — tarea 5, caso 201.
    effect(() => {
      if (this.result()) {
        this.form.reset({ destAccountNumber: '', amount: '' });
        this.store.dispatch(myAccountActions.loadMyAccount());
      }
    });

    // Completa el submit disparado por el fallback de `submit()` (el blur
    // nunca llegó a resolver el número actual) apenas la resolución
    // dispuesta ahí mismo responde — éxito o error, nunca deja el "pending"
    // colgado. Lee las 4 señales SIN early-return antes de leerlas todas,
    // para que el effect quede suscripto a las 4 y vuelva a correr con
    // cualquiera de sus cambios (ver el comentario de `pendingSubmit`).
    effect(() => {
      const pending = this.pendingSubmit();
      const loading = this.lookupLoading();
      const resolved = this.lookupResult();
      this.lookupError();
      if (!pending || loading) {
        return;
      }
      this.pendingSubmit.set(false);
      if (resolved && this.isLookupCurrent(resolved.accountNumber)) {
        this.beginTransfer(resolved.id);
      }
      // Si falló, no hacemos nada más: el mensaje ya se muestra vía el
      // bloque `isLookupCurrent() && lookupError()` del template — el
      // usuario tiene que corregir el número e intentar de nuevo.
    });
  }

  retryLoadAccount(): void {
    this.store.dispatch(myAccountActions.loadMyAccount());
  }

  onDestAccountNumberBlur(): void {
    const accountNumber = this.destAccountNumberValue();
    if (accountNumber && accountNumber !== this.lookupRequestedFor()) {
      this.store.dispatch(accountLookupActions.lookupAccount({ accountNumber }));
    }
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const accountNumber = this.destAccountNumberValue();
    if (this.isLookupCurrent(accountNumber)) {
      const resolved = this.lookupResult();
      if (resolved) {
        this.beginTransfer(resolved.id);
      }
      // Ya hay un error resuelto para este mismo número (ej. 404) — no
      // reintentamos solos, el usuario tiene que corregirlo primero.
      return;
    }
    // El blur no llegó a resolver el número actual — resolvemos ahora
    // mismo; el submit real se completa en el effect() de arriba apenas
    // el lookup responda.
    this.pendingSubmit.set(true);
    this.store.dispatch(accountLookupActions.lookupAccount({ accountNumber }));
  }

  retry(): void {
    const presentation = this.errorPresentation();
    // `lastDestAccountId`/`lastIdempotencyKey` siempre se setean juntos (ver
    // `dispatchTransfer`) — ambos null significa "nunca hubo un submit
    // real todavía", el mismo caso defensivo de siempre.
    if (!presentation || !this.lastDestAccountId || !this.lastIdempotencyKey) {
      return;
    }
    const idempotencyKey =
      presentation.retryStrategy === 'same-key' ? this.lastIdempotencyKey : generateUuid();
    this.dispatchTransfer(idempotencyKey, this.lastDestAccountId);
  }

  private beginTransfer(destAccountId: string): void {
    this.dispatchTransfer(generateUuid(), destAccountId);
  }

  private dispatchTransfer(idempotencyKey: string, destAccountId: string): void {
    this.lastIdempotencyKey = idempotencyKey;
    this.lastDestAccountId = destAccountId;
    const { amount } = this.form.getRawValue();
    this.store.dispatch(transferActions.submitTransfer({ destAccountId, amount, idempotencyKey }));
  }
}
