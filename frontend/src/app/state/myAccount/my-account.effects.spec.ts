import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Subject, firstValueFrom, of, throwError } from 'rxjs';

import { AccountsService } from '../../core/services/accounts.service';
import { myAccountActions } from './my-account.actions';
import { MyAccountEffects } from './my-account.effects';
import { MyAccount } from './my-account.model';

const account: MyAccount = {
  id: 'acc-1',
  accountNumber: '1000000001',
  balance: '898.00',
  accountType: 'BASIC',
  status: 'ACTIVE',
  avatarUrl: null,
};

describe('MyAccountEffects', () => {
  let actions$: Subject<unknown>;
  let accountsService: { me: ReturnType<typeof vi.fn> };

  function setup(): MyAccountEffects {
    actions$ = new Subject();
    accountsService = { me: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        MyAccountEffects,
        provideMockActions(() => actions$),
        { provide: AccountsService, useValue: accountsService },
      ],
    });

    return TestBed.inject(MyAccountEffects);
  }

  it('takes the first account from the array on success', async () => {
    const effects = setup();
    accountsService.me.mockReturnValue(of([account]));

    const promise = firstValueFrom(effects.loadMyAccount$);
    actions$.next(myAccountActions.loadMyAccount());

    expect(await promise).toEqual(myAccountActions.loadMyAccountSuccess({ account }));
  });

  it('resolves to account: null when the array is empty (ej. un ADMIN sin cuentas propias)', async () => {
    const effects = setup();
    accountsService.me.mockReturnValue(of([]));

    const promise = firstValueFrom(effects.loadMyAccount$);
    actions$.next(myAccountActions.loadMyAccount());

    expect(await promise).toEqual(myAccountActions.loadMyAccountSuccess({ account: null }));
  });

  it('maps a backend error to loadMyAccountFailure with the real message', async () => {
    const effects = setup();
    accountsService.me.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500, error: { message: 'boom' } })),
    );

    const promise = firstValueFrom(effects.loadMyAccount$);
    actions$.next(myAccountActions.loadMyAccount());

    expect(await promise).toEqual(myAccountActions.loadMyAccountFailure({ error: 'boom' }));
  });

  it('dispatches loadMyAccountFailure with a fallback message when the backend gives no message', async () => {
    const effects = setup();
    accountsService.me.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0, error: null })));

    const promise = firstValueFrom(effects.loadMyAccount$);
    actions$.next(myAccountActions.loadMyAccount());

    expect(await promise).toEqual(
      myAccountActions.loadMyAccountFailure({ error: 'No se pudo cargar tu cuenta.' }),
    );
  });

  it('cancels an in-flight request when a newer loadMyAccount is dispatched (switchMap)', async () => {
    const effects = setup();
    const second = [{ ...account, id: 'acc-2' }];
    const firstResponse = new Subject<MyAccount[]>();
    accountsService.me.mockReturnValueOnce(firstResponse).mockReturnValueOnce(of(second));

    const emitted: unknown[] = [];
    const sub = effects.loadMyAccount$.subscribe((action) => emitted.push(action));

    actions$.next(myAccountActions.loadMyAccount());
    actions$.next(myAccountActions.loadMyAccount());
    firstResponse.next([account]);
    firstResponse.complete();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(emitted).toEqual([myAccountActions.loadMyAccountSuccess({ account: second[0] })]);
    sub.unsubscribe();
  });
});
