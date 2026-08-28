import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { AccountLookupResult } from '../../state/accountLookup/account-lookup.model';
import { ListAccountsQuery, ListAccountsResult } from '../../state/accounts/accounts.model';
import { MyAccount } from '../../state/myAccount/my-account.model';

/**
 * Único lugar que inyecta HttpClient para todo lo de cuentas (RNF-03) —
 * ni el container ni los componentes presentacionales lo hacen directo.
 *
 * `me()` (Sesión 3 de transferencias) se agregó ACÁ en vez de crear un
 * `MyAccountService` aparte: `GET /accounts/me` sigue siendo el mismo
 * recurso ("cuentas") que `GET /accounts` (Sesión 14), solo con un scope
 * distinto (propias vs. todas/admin) — mantener un único servicio por
 * recurso es el mismo criterio que ya evita, por ejemplo, que
 * `AuthService` y un hipotético `ProfileService` se dividan el mismo
 * `GET /auth/me`. Documentado en PROGRESS.md.
 *
 * `lookup()` (Sesión 20, backend Sesión 19) mismo criterio: sigue siendo el
 * mismo recurso, ahora resuelto por `accountNumber` en vez de por `id`/scope
 * propio.
 */
@Injectable({ providedIn: 'root' })
export class AccountsService {
  private readonly http = inject(HttpClient);

  list(query: ListAccountsQuery): Observable<ListAccountsResult> {
    let params = new HttpParams().set('page', query.page).set('limit', query.limit);
    if (query.documentNumber) {
      params = params.set('documentNumber', query.documentNumber);
    }
    if (query.status) {
      params = params.set('status', query.status);
    }
    return this.http.get<ListAccountsResult>('accounts', { params });
  }

  /**
   * Contrato real (verificado contra /api/docs-json y curl real con token
   * de basic@findash.dev): devuelve un ARRAY, nunca un objeto único — ver
   * el comentario en my-account.model.ts.
   */
  me(): Observable<MyAccount[]> {
    return this.http.get<MyAccount[]>('accounts/me');
  }

  /**
   * Contrato real (verificado contra /api/docs-json y curl real): 200
   * `{ id, accountNumber, accountType }` o 404 si no existe ninguna cuenta
   * con ese `accountNumber` — el 404 se propaga tal cual (`HttpErrorResponse`),
   * `AccountLookupEffects` lo traduce a `lookupAccountFailure`.
   */
  lookup(accountNumber: string): Observable<AccountLookupResult> {
    const params = new HttpParams().set('accountNumber', accountNumber);
    return this.http.get<AccountLookupResult>('accounts/lookup', { params });
  }
}
