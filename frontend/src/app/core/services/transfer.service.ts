import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { TransferResult } from '../../state/transfer/transfer.model';

/**
 * Único lugar con HttpClient para POST /transactions/transfer (RNF-03) —
 * arma el header `X-Idempotency-Key` en cada llamada, nunca lo genera
 * (eso es responsabilidad de quien llama, `TransferFormPage` — ver
 * PROGRESS.md sobre por qué la key se genera una vez por intento de
 * submit, no acá adentro, y no reutilizada entre envíos distintos salvo
 * el caso explícito del retry ante 409).
 */
@Injectable({ providedIn: 'root' })
export class TransferService {
  private readonly http = inject(HttpClient);

  transfer(
    destAccountId: string,
    amount: string,
    idempotencyKey: string,
  ): Observable<TransferResult> {
    const headers = new HttpHeaders({ 'X-Idempotency-Key': idempotencyKey });
    return this.http.post<TransferResult>(
      'transactions/transfer',
      { destAccountId, amount },
      { headers },
    );
  }
}
