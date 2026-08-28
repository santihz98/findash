import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ListMyTransactionsQuery, ListMyTransactionsResult } from '../../state/myTransactions/my-transactions.model';
import {
  ListTransactionsAuditQuery,
  ListTransactionsAuditResult,
} from '../../state/transactionsAudit/transactions-audit.model';

/**
 * Único lugar que inyecta HttpClient para GET /transactions/me y
 * GET /transactions (RNF-03) — mismo criterio que `AccountsService`
 * (Sesión 14/15): son el mismo recurso ("transacciones"), solo con un scope
 * distinto (propias vs. todas/auditoría), así que viven en un único
 * servicio en vez de uno por endpoint.
 */
@Injectable({ providedIn: 'root' })
export class TransactionHistoryService {
  private readonly http = inject(HttpClient);

  myHistory(query: ListMyTransactionsQuery): Observable<ListMyTransactionsResult> {
    const params = new HttpParams().set('page', query.page).set('limit', query.limit);
    return this.http.get<ListMyTransactionsResult>('transactions/me', { params });
  }

  /**
   * `status`/`dateFrom`/`dateTo` solo se agregan si vienen con valor —
   * mismo criterio que `AccountsService.list()` con `documentNumber`/
   * `status`: un filtro vacío no debe mandarse como query param vacío
   * (`?status=`), que el backend interpretaría distinto a "sin filtro".
   */
  auditList(query: ListTransactionsAuditQuery): Observable<ListTransactionsAuditResult> {
    let params = new HttpParams().set('page', query.page).set('limit', query.limit);
    if (query.status) {
      params = params.set('status', query.status);
    }
    if (query.dateFrom) {
      params = params.set('dateFrom', query.dateFrom);
    }
    if (query.dateTo) {
      params = params.set('dateTo', query.dateTo);
    }
    return this.http.get<ListTransactionsAuditResult>('transactions', { params });
  }
}
