import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { AccountsService } from '../../core/services/accounts.service';
import { extractErrorMessage } from '../../core/utils/extract-error-message.util';
import { accountLookupActions } from './account-lookup.actions';

@Injectable()
export class AccountLookupEffects {
  private readonly actions$ = inject(Actions);
  private readonly accountsService = inject(AccountsService);

  /**
   * `switchMap`, mismo criterio que `AccountsEffects.loadAccounts$`: cada
   * lookup nuevo (el usuario corrigió el número y volvió a salir del campo)
   * cancela cualquier resolución anterior todavía en vuelo — una respuesta
   * lenta de un número viejo nunca puede pisar la del número actual.
   */
  lookupAccount$ = createEffect(() =>
    this.actions$.pipe(
      ofType(accountLookupActions.lookupAccount),
      switchMap(({ accountNumber }) =>
        this.accountsService.lookup(accountNumber).pipe(
          map((result) => accountLookupActions.lookupAccountSuccess({ result })),
          catchError((error: HttpErrorResponse) =>
            of(
              accountLookupActions.lookupAccountFailure({
                message: extractErrorMessage(error, 'No se pudo resolver la cuenta destino.'),
              }),
            ),
          ),
        ),
      ),
    ),
  );
}
