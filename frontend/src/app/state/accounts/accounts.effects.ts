import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { AccountsService } from '../../core/services/accounts.service';
import { extractErrorMessage } from '../../core/utils/extract-error-message.util';
import { accountsActions } from './accounts.actions';

@Injectable()
export class AccountsEffects {
  private readonly actions$ = inject(Actions);
  private readonly accountsService = inject(AccountsService);

  /**
   * `switchMap`, no `mergeMap`/`concatMap`: cada `loadAccounts` nuevo
   * (cambio de filtro o de página) cancela cualquier request anterior
   * todavía en vuelo — sin esto, una respuesta lenta de una página vieja
   * podría llegar después que la de la página nueva y pisarla con datos
   * obsoletos.
   */
  loadAccounts$ = createEffect(() =>
    this.actions$.pipe(
      ofType(accountsActions.loadAccounts),
      switchMap(({ query }) =>
        this.accountsService.list(query).pipe(
          map((result) => accountsActions.loadAccountsSuccess({ result })),
          catchError((error: HttpErrorResponse) =>
            of(
              accountsActions.loadAccountsFailure({
                error: extractErrorMessage(error, 'No se pudieron cargar las cuentas.'),
              }),
            ),
          ),
        ),
      ),
    ),
  );
}
