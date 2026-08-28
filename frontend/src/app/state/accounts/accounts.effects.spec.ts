import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Subject, firstValueFrom, of, throwError } from 'rxjs';

import { AccountsService } from '../../core/services/accounts.service';
import { accountsActions } from './accounts.actions';
import { AccountsEffects } from './accounts.effects';
import { ListAccountsResult } from './accounts.model';

const result: ListAccountsResult = {
  data: [],
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
};

describe('AccountsEffects', () => {
  let actions$: Subject<unknown>;
  let accountsService: { list: ReturnType<typeof vi.fn> };

  function setup(): AccountsEffects {
    actions$ = new Subject();
    accountsService = { list: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        AccountsEffects,
        provideMockActions(() => actions$),
        { provide: AccountsService, useValue: accountsService },
      ],
    });

    return TestBed.inject(AccountsEffects);
  }

  it('dispatches loadAccountsSuccess with the backend result on success', async () => {
    const effects = setup();
    accountsService.list.mockReturnValue(of(result));

    const promise = firstValueFrom(effects.loadAccounts$);
    actions$.next(accountsActions.loadAccounts({ query: { page: 1, limit: 20 } }));

    expect(await promise).toEqual(accountsActions.loadAccountsSuccess({ result }));
    expect(accountsService.list).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it('dispatches loadAccountsFailure with the backend message on error', async () => {
    const effects = setup();
    accountsService.list.mockReturnValue(
      throwError(
        () => new HttpErrorResponse({ status: 403, error: { message: 'Forbidden resource' } }),
      ),
    );

    const promise = firstValueFrom(effects.loadAccounts$);
    actions$.next(accountsActions.loadAccounts({ query: { page: 1, limit: 20 } }));

    expect(await promise).toEqual(
      accountsActions.loadAccountsFailure({ error: 'Forbidden resource' }),
    );
  });

  it('dispatches loadAccountsFailure with a fallback message when the backend gives no message', async () => {
    const effects = setup();
    accountsService.list.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 0, error: null })),
    );

    const promise = firstValueFrom(effects.loadAccounts$);
    actions$.next(accountsActions.loadAccounts({ query: { page: 1, limit: 20 } }));

    expect(await promise).toEqual(
      accountsActions.loadAccountsFailure({ error: 'No se pudieron cargar las cuentas.' }),
    );
  });

  it('cancels an in-flight request when a newer loadAccounts is dispatched (switchMap)', async () => {
    const effects = setup();
    const firstResult: ListAccountsResult = { ...result, page: 1 };
    const secondResult: ListAccountsResult = { ...result, page: 2 };

    // La primera respuesta se demora más que la segunda a propósito.
    const firstResponse = new Subject<ListAccountsResult>();
    accountsService.list.mockReturnValueOnce(firstResponse).mockReturnValueOnce(of(secondResult));

    const emitted: unknown[] = [];
    const sub = effects.loadAccounts$.subscribe((action) => emitted.push(action));

    actions$.next(accountsActions.loadAccounts({ query: { page: 1, limit: 20 } }));
    actions$.next(accountsActions.loadAccounts({ query: { page: 2, limit: 20 } }));
    firstResponse.next(firstResult);
    firstResponse.complete();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(emitted).toEqual([accountsActions.loadAccountsSuccess({ result: secondResult })]);
    sub.unsubscribe();
  });
});
