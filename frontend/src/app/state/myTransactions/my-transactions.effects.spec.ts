import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Subject, firstValueFrom, of, throwError } from 'rxjs';

import { TransactionHistoryService } from '../../core/services/transaction-history.service';
import { myTransactionsActions } from './my-transactions.actions';
import { MyTransactionsEffects } from './my-transactions.effects';
import { ListMyTransactionsResult } from './my-transactions.model';

const result: ListMyTransactionsResult = {
  data: [],
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
};

describe('MyTransactionsEffects', () => {
  let actions$: Subject<unknown>;
  let transactionHistoryService: { myHistory: ReturnType<typeof vi.fn> };

  function setup(): MyTransactionsEffects {
    actions$ = new Subject();
    transactionHistoryService = { myHistory: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        MyTransactionsEffects,
        provideMockActions(() => actions$),
        { provide: TransactionHistoryService, useValue: transactionHistoryService },
      ],
    });

    return TestBed.inject(MyTransactionsEffects);
  }

  it('dispatches loadHistorySuccess with the backend result on success', async () => {
    const effects = setup();
    transactionHistoryService.myHistory.mockReturnValue(of(result));

    const promise = firstValueFrom(effects.loadHistory$);
    actions$.next(myTransactionsActions.loadHistory({ query: { page: 1, limit: 20 } }));

    expect(await promise).toEqual(myTransactionsActions.loadHistorySuccess({ result }));
    expect(transactionHistoryService.myHistory).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it('dispatches loadHistoryFailure with the backend message on error (e.g. 422 NoOriginAccountException)', async () => {
    const effects = setup();
    transactionHistoryService.myHistory.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 422,
            error: { message: 'No se encontró una única cuenta de origen para este usuario' },
          }),
      ),
    );

    const promise = firstValueFrom(effects.loadHistory$);
    actions$.next(myTransactionsActions.loadHistory({ query: { page: 1, limit: 20 } }));

    expect(await promise).toEqual(
      myTransactionsActions.loadHistoryFailure({
        error: 'No se encontró una única cuenta de origen para este usuario',
      }),
    );
  });

  it('dispatches loadHistoryFailure with a fallback message when the backend gives no message', async () => {
    const effects = setup();
    transactionHistoryService.myHistory.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 0, error: null })),
    );

    const promise = firstValueFrom(effects.loadHistory$);
    actions$.next(myTransactionsActions.loadHistory({ query: { page: 1, limit: 20 } }));

    expect(await promise).toEqual(
      myTransactionsActions.loadHistoryFailure({
        error: 'No se pudo cargar tu historial de movimientos.',
      }),
    );
  });

  it('cancels an in-flight request when a newer loadHistory is dispatched (switchMap)', async () => {
    const effects = setup();
    const firstResult: ListMyTransactionsResult = { ...result, page: 1 };
    const secondResult: ListMyTransactionsResult = { ...result, page: 2 };

    const firstResponse = new Subject<ListMyTransactionsResult>();
    transactionHistoryService.myHistory
      .mockReturnValueOnce(firstResponse)
      .mockReturnValueOnce(of(secondResult));

    const emitted: unknown[] = [];
    const sub = effects.loadHistory$.subscribe((action) => emitted.push(action));

    actions$.next(myTransactionsActions.loadHistory({ query: { page: 1, limit: 20 } }));
    actions$.next(myTransactionsActions.loadHistory({ query: { page: 2, limit: 20 } }));
    firstResponse.next(firstResult);
    firstResponse.complete();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(emitted).toEqual([myTransactionsActions.loadHistorySuccess({ result: secondResult })]);
    sub.unsubscribe();
  });
});
