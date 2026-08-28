import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Subject, firstValueFrom, of, throwError } from 'rxjs';

import { AccountsService } from '../../core/services/accounts.service';
import { accountLookupActions } from './account-lookup.actions';
import { AccountLookupEffects } from './account-lookup.effects';
import { AccountLookupResult } from './account-lookup.model';

const result: AccountLookupResult = {
  id: 'dest-1',
  accountNumber: '1000000002',
  accountType: 'PREMIUM',
};

describe('AccountLookupEffects', () => {
  let actions$: Subject<unknown>;
  let accountsService: { lookup: ReturnType<typeof vi.fn> };

  function setup(): AccountLookupEffects {
    actions$ = new Subject();
    accountsService = { lookup: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        AccountLookupEffects,
        provideMockActions(() => actions$),
        { provide: AccountsService, useValue: accountsService },
      ],
    });

    return TestBed.inject(AccountLookupEffects);
  }

  it('dispatches lookupAccountSuccess with the backend result on success', async () => {
    const effects = setup();
    accountsService.lookup.mockReturnValue(of(result));

    const promise = firstValueFrom(effects.lookupAccount$);
    actions$.next(accountLookupActions.lookupAccount({ accountNumber: '1000000002' }));

    expect(await promise).toEqual(accountLookupActions.lookupAccountSuccess({ result }));
    expect(accountsService.lookup).toHaveBeenCalledWith('1000000002');
  });

  it('dispatches lookupAccountFailure with the backend message on a 404', async () => {
    const effects = setup();
    accountsService.lookup.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 404,
            error: { message: 'La cuenta destino "9999999999" no existe' },
          }),
      ),
    );

    const promise = firstValueFrom(effects.lookupAccount$);
    actions$.next(accountLookupActions.lookupAccount({ accountNumber: '9999999999' }));

    expect(await promise).toEqual(
      accountLookupActions.lookupAccountFailure({
        message: 'La cuenta destino "9999999999" no existe',
      }),
    );
  });

  it('dispatches lookupAccountFailure with a fallback message when the backend gives no message', async () => {
    const effects = setup();
    accountsService.lookup.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 0, error: null })),
    );

    const promise = firstValueFrom(effects.lookupAccount$);
    actions$.next(accountLookupActions.lookupAccount({ accountNumber: '1000000002' }));

    expect(await promise).toEqual(
      accountLookupActions.lookupAccountFailure({
        message: 'No se pudo resolver la cuenta destino.',
      }),
    );
  });

  it('cancels an in-flight lookup when a newer one is dispatched (switchMap)', async () => {
    const effects = setup();
    const firstResult: AccountLookupResult = { ...result, accountNumber: '1111111111' };
    const secondResult: AccountLookupResult = { ...result, accountNumber: '2222222222' };

    const firstResponse = new Subject<AccountLookupResult>();
    accountsService.lookup.mockReturnValueOnce(firstResponse).mockReturnValueOnce(of(secondResult));

    const emitted: unknown[] = [];
    const sub = effects.lookupAccount$.subscribe((action) => emitted.push(action));

    actions$.next(accountLookupActions.lookupAccount({ accountNumber: '1111111111' }));
    actions$.next(accountLookupActions.lookupAccount({ accountNumber: '2222222222' }));
    firstResponse.next(firstResult);
    firstResponse.complete();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(emitted).toEqual([accountLookupActions.lookupAccountSuccess({ result: secondResult })]);
    sub.unsubscribe();
  });
});
