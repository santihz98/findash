import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Subject, firstValueFrom, of, throwError } from 'rxjs';

import { TransactionHistoryService } from '../../core/services/transaction-history.service';
import { transactionsAuditActions } from './transactions-audit.actions';
import { TransactionsAuditEffects } from './transactions-audit.effects';
import { ListTransactionsAuditResult } from './transactions-audit.model';

const result: ListTransactionsAuditResult = {
  data: [],
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
};

describe('TransactionsAuditEffects', () => {
  let actions$: Subject<unknown>;
  let transactionHistoryService: { auditList: ReturnType<typeof vi.fn> };

  function setup(): TransactionsAuditEffects {
    actions$ = new Subject();
    transactionHistoryService = { auditList: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        TransactionsAuditEffects,
        provideMockActions(() => actions$),
        { provide: TransactionHistoryService, useValue: transactionHistoryService },
      ],
    });

    return TestBed.inject(TransactionsAuditEffects);
  }

  it('dispatches loadTransactionsSuccess with the backend result on success', async () => {
    const effects = setup();
    transactionHistoryService.auditList.mockReturnValue(of(result));

    const promise = firstValueFrom(effects.loadTransactions$);
    actions$.next(transactionsAuditActions.loadTransactions({ query: { page: 1, limit: 20 } }));

    expect(await promise).toEqual(transactionsAuditActions.loadTransactionsSuccess({ result }));
    expect(transactionHistoryService.auditList).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it('dispatches loadTransactionsFailure with the backend message on error (e.g. 403 CLIENT)', async () => {
    const effects = setup();
    transactionHistoryService.auditList.mockReturnValue(
      throwError(
        () => new HttpErrorResponse({ status: 403, error: { message: 'Forbidden resource' } }),
      ),
    );

    const promise = firstValueFrom(effects.loadTransactions$);
    actions$.next(transactionsAuditActions.loadTransactions({ query: { page: 1, limit: 20 } }));

    expect(await promise).toEqual(
      transactionsAuditActions.loadTransactionsFailure({ error: 'Forbidden resource' }),
    );
  });

  it('dispatches loadTransactionsFailure with a fallback message when the backend gives no message', async () => {
    const effects = setup();
    transactionHistoryService.auditList.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 0, error: null })),
    );

    const promise = firstValueFrom(effects.loadTransactions$);
    actions$.next(transactionsAuditActions.loadTransactions({ query: { page: 1, limit: 20 } }));

    expect(await promise).toEqual(
      transactionsAuditActions.loadTransactionsFailure({
        error: 'No se pudieron cargar las transacciones.',
      }),
    );
  });

  it('passes status/dateFrom/dateTo through to the service untouched', async () => {
    const effects = setup();
    transactionHistoryService.auditList.mockReturnValue(of(result));
    const query = { page: 1, limit: 20, status: 'REJECTED' as const, dateFrom: '2026-08-01' };

    const promise = firstValueFrom(effects.loadTransactions$);
    actions$.next(transactionsAuditActions.loadTransactions({ query }));
    await promise;

    expect(transactionHistoryService.auditList).toHaveBeenCalledWith(query);
  });

  it('cancels an in-flight request when a newer loadTransactions is dispatched (switchMap)', async () => {
    const effects = setup();
    const firstResult: ListTransactionsAuditResult = { ...result, page: 1 };
    const secondResult: ListTransactionsAuditResult = { ...result, page: 2 };

    const firstResponse = new Subject<ListTransactionsAuditResult>();
    transactionHistoryService.auditList
      .mockReturnValueOnce(firstResponse)
      .mockReturnValueOnce(of(secondResult));

    const emitted: unknown[] = [];
    const sub = effects.loadTransactions$.subscribe((action) => emitted.push(action));

    actions$.next(transactionsAuditActions.loadTransactions({ query: { page: 1, limit: 20 } }));
    actions$.next(transactionsAuditActions.loadTransactions({ query: { page: 2, limit: 20 } }));
    firstResponse.next(firstResult);
    firstResponse.complete();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(emitted).toEqual([
      transactionsAuditActions.loadTransactionsSuccess({ result: secondResult }),
    ]);
    sub.unsubscribe();
  });
});
