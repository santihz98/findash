import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { AccountsService } from '../../core/services/accounts.service';
import { extractErrorMessage } from '../../core/utils/extract-error-message.util';
import { myAccountActions } from './my-account.actions';

@Injectable()
export class MyAccountEffects {
  private readonly actions$ = inject(Actions);
  private readonly accountsService = inject(AccountsService);

  /**
   * `switchMap`: mismo criterio que `AccountsEffects.loadAccounts$`
   * (Sesión 14) — es una lectura (GET), cancelar una respuesta vieja que
   * todavía no llegó cuando ya se pidió una nueva (ej. el refetch tras una
   * transferencia exitosa) es seguro y deseable.
   */
  loadMyAccount$ = createEffect(() =>
    this.actions$.pipe(
      ofType(myAccountActions.loadMyAccount),
      switchMap(() =>
        this.accountsService.me().pipe(
          map((accounts) => myAccountActions.loadMyAccountSuccess({ account: accounts[0] ?? null })),
          catchError((error: HttpErrorResponse) =>
            of(
              myAccountActions.loadMyAccountFailure({
                error: extractErrorMessage(error, 'No se pudo cargar tu cuenta.'),
              }),
            ),
          ),
        ),
      ),
    ),
  );
}
