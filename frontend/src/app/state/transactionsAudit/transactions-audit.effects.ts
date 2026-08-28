import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { TransactionHistoryService } from '../../core/services/transaction-history.service';
import { extractErrorMessage } from '../../core/utils/extract-error-message.util';
import { transactionsAuditActions } from './transactions-audit.actions';

@Injectable()
export class TransactionsAuditEffects {
  private readonly actions$ = inject(Actions);
  private readonly transactionHistoryService = inject(TransactionHistoryService);

  /** `switchMap`: cada cambio de filtro/página cancela cualquier request anterior todavía en vuelo (mismo criterio que `AccountsEffects`). */
  loadTransactions$ = createEffect(() =>
    this.actions$.pipe(
      ofType(transactionsAuditActions.loadTransactions),
      switchMap(({ query }) =>
        this.transactionHistoryService.auditList(query).pipe(
          map((result) => transactionsAuditActions.loadTransactionsSuccess({ result })),
          catchError((error: HttpErrorResponse) =>
            of(
              transactionsAuditActions.loadTransactionsFailure({
                error: extractErrorMessage(error, 'No se pudieron cargar las transacciones.'),
              }),
            ),
          ),
        ),
      ),
    ),
  );
}
