import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of } from 'rxjs';
import { catchError, exhaustMap, map } from 'rxjs/operators';

import { TransferService } from '../../core/services/transfer.service';
import { extractErrorMessage } from '../../core/utils/extract-error-message.util';
import { transferActions } from './transfer.actions';

/**
 * Fallback por código, usado solo si el backend no manda `message` en el
 * body (no debería pasar en la práctica — cada excepción de dominio del
 * backend siempre trae uno, ver PROGRESS.md Sesión 6.5/6 — pero
 * `extractErrorMessage` necesita algo concreto para el caso "backend
 * caído del todo", donde no hay body en absoluto).
 */
function fallbackMessageFor(status: number): string {
  switch (status) {
    case 400:
      return 'Los datos ingresados no son válidos.';
    case 403:
      return 'No tenés permiso para realizar transferencias.';
    case 404:
      return 'La cuenta destino no existe.';
    case 409:
      return 'Ya hay una transferencia en curso con esta operación.';
    case 422:
      return 'No se pudo completar la transferencia.';
    case 504:
      return 'El servicio antifraude no respondió a tiempo.';
    default:
      return 'No se pudo completar la transferencia.';
  }
}

@Injectable()
export class TransferEffects {
  private readonly actions$ = inject(Actions);
  private readonly transferService = inject(TransferService);

  /**
   * `exhaustMap`, no `switchMap`: una transferencia ya enviada al backend
   * nunca debe "cancelarse" del lado del cliente para arrancar otra — a
   * diferencia de un GET (`AccountsEffects`/`MyAccountEffects`), acá el
   * request ya puede haber movido dinero real. El propio formulario
   * deshabilita el submit mientras `submitting` es `true` (ver
   * transfer-form.page.ts), así que en la práctica no debería haber una
   * segunda emisión concurrente — `exhaustMap` es la red de seguridad que
   * lo garantiza también a nivel de effect, mismo criterio que
   * `AuthEffects.refreshToken$` (Sesión 13).
   */
  submitTransfer$ = createEffect(() =>
    this.actions$.pipe(
      ofType(transferActions.submitTransfer),
      exhaustMap(({ destAccountId, amount, idempotencyKey }) =>
        this.transferService.transfer(destAccountId, amount, idempotencyKey).pipe(
          map((result) => transferActions.transferSuccess({ result })),
          catchError((error: HttpErrorResponse) =>
            of(
              transferActions.transferFailure({
                status: error.status,
                message: extractErrorMessage(error, fallbackMessageFor(error.status)),
              }),
            ),
          ),
        ),
      ),
    ),
  );
}
