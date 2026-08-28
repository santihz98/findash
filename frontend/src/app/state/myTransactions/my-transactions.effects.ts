import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { TransactionHistoryService } from '../../core/services/transaction-history.service';
import { extractErrorMessage } from '../../core/utils/extract-error-message.util';
import { myTransactionsActions } from './my-transactions.actions';

@Injectable()
export class MyTransactionsEffects {
  private readonly actions$ = inject(Actions);
  private readonly transactionHistoryService = inject(TransactionHistoryService);

  /**
   * `switchMap`, mismo criterio que `AccountsEffects.loadAccounts$`: un
   * cambio de página cancela cualquier request de página anterior todavía
   * en vuelo. El 422 (`NoOriginAccountException`, usuario sin exactamente
   * una cuenta) no tiene manejo especial acá — cae en el mismo
   * `catchError` genérico que cualquier otro error, y `extractErrorMessage`
   * ya muestra el mensaje real del backend tal cual.
   */
  loadHistory$ = createEffect(() =>
    this.actions$.pipe(
      ofType(myTransactionsActions.loadHistory),
      switchMap(({ query }) =>
        this.transactionHistoryService.myHistory(query).pipe(
          map((result) => myTransactionsActions.loadHistorySuccess({ result })),
          catchError((error: HttpErrorResponse) =>
            of(
              myTransactionsActions.loadHistoryFailure({
                error: extractErrorMessage(error, 'No se pudo cargar tu historial de movimientos.'),
              }),
            ),
          ),
        ),
      ),
    ),
  );
}
