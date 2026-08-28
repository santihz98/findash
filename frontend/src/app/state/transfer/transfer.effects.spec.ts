import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Subject, firstValueFrom, of, throwError } from 'rxjs';

import { TransferService } from '../../core/services/transfer.service';
import { transferActions } from './transfer.actions';
import { TransferResult } from './transfer.model';
import { TransferEffects } from './transfer.effects';

const result: TransferResult = {
  id: 'tx-1',
  originAccountId: 'origin-1',
  destAccountId: 'dest-1',
  amount: '100.00',
  commission: '2.00',
  authorizationCode: 'ABC123',
  status: 'COMPLETED',
  createdAt: '2026-08-28T00:00:00.000Z',
};

describe('TransferEffects', () => {
  let actions$: Subject<unknown>;
  let transferService: { transfer: ReturnType<typeof vi.fn> };

  function setup(): TransferEffects {
    actions$ = new Subject();
    transferService = { transfer: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        TransferEffects,
        provideMockActions(() => actions$),
        { provide: TransferService, useValue: transferService },
      ],
    });

    return TestBed.inject(TransferEffects);
  }

  function submit() {
    return transferActions.submitTransfer({
      destAccountId: 'dest-1',
      amount: '100.00',
      idempotencyKey: 'key-1',
    });
  }

  it('dispatches transferSuccess with the backend result on 201', async () => {
    const effects = setup();
    transferService.transfer.mockReturnValue(of(result));

    const promise = firstValueFrom(effects.submitTransfer$);
    actions$.next(submit());

    expect(await promise).toEqual(transferActions.transferSuccess({ result }));
    expect(transferService.transfer).toHaveBeenCalledWith('dest-1', '100.00', 'key-1');
  });

  it.each([
    [400, 'amount inválido'],
    [403, 'Forbidden resource'],
    [404, 'La cuenta destino "x" no existe'],
    [409, 'Ya hay una transferencia en curso con esta X-Idempotency-Key.'],
    [422, 'Fondos insuficientes para completar la transferencia'],
    [504, 'El servicio anti-fraude no respondió a tiempo.'],
  ])('maps a %i backend error to transferFailure with the exact status and message', async (status, message) => {
    const effects = setup();
    transferService.transfer.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status, error: { message } })),
    );

    const promise = firstValueFrom(effects.submitTransfer$);
    actions$.next(submit());

    expect(await promise).toEqual(transferActions.transferFailure({ status, message }));
  });

  it('falls back to a status-specific message when the backend gives no body at all', async () => {
    const effects = setup();
    transferService.transfer.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 504, error: null })));

    const promise = firstValueFrom(effects.submitTransfer$);
    actions$.next(submit());

    const action = (await promise) as ReturnType<typeof transferActions.transferFailure>;
    expect(action.status).toBe(504);
    expect(action.message).toContain('antifraude');
  });

  it('falls back to a generic message for an unmapped status with no body (ej. 500)', async () => {
    const effects = setup();
    transferService.transfer.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500, error: null })));

    const promise = firstValueFrom(effects.submitTransfer$);
    actions$.next(submit());

    const action = (await promise) as ReturnType<typeof transferActions.transferFailure>;
    expect(action.status).toBe(500);
    expect(action.message).toBe('No se pudo completar la transferencia.');
  });

  it('uses exhaustMap: a second submitTransfer while one is in flight is ignored, never sent twice', async () => {
    const effects = setup();
    const inFlight = new Subject<TransferResult>();
    transferService.transfer.mockReturnValue(inFlight);

    const emitted: unknown[] = [];
    const sub = effects.submitTransfer$.subscribe((action) => emitted.push(action));

    actions$.next(submit());
    actions$.next(
      transferActions.submitTransfer({
        destAccountId: 'dest-2',
        amount: '5.00',
        idempotencyKey: 'key-2',
      }),
    );
    inFlight.next(result);
    inFlight.complete();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(transferService.transfer).toHaveBeenCalledTimes(1);
    expect(emitted).toEqual([transferActions.transferSuccess({ result })]);
    sub.unsubscribe();
  });
});
