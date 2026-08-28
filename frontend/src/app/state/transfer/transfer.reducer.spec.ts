import { transferActions } from './transfer.actions';
import { TransferResult, initialTransferState } from './transfer.model';
import { transferReducer } from './transfer.reducer';

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

describe('transferReducer', () => {
  it('submitTransfer sets submitting and clears any previous result/error', () => {
    const state = transferReducer(
      { ...initialTransferState, result, errorStatus: 422, errorMessage: 'boom' },
      transferActions.submitTransfer({
        destAccountId: 'dest-1',
        amount: '100.00',
        idempotencyKey: 'key-1',
      }),
    );

    expect(state.submitting).toBe(true);
    expect(state.result).toBeNull();
    expect(state.errorStatus).toBeNull();
    expect(state.errorMessage).toBeNull();
  });

  it('transferSuccess stores the result and clears any previous error', () => {
    const state = transferReducer(
      { ...initialTransferState, submitting: true, errorStatus: 422, errorMessage: 'boom' },
      transferActions.transferSuccess({ result }),
    );

    expect(state.submitting).toBe(false);
    expect(state.result).toEqual(result);
    expect(state.errorStatus).toBeNull();
    expect(state.errorMessage).toBeNull();
  });

  it('transferFailure stores status/message and clears any stale result (tarea 8: NO toca datos de formulario, que ni siquiera viven acá)', () => {
    const state = transferReducer(
      { ...initialTransferState, submitting: true, result },
      transferActions.transferFailure({ status: 422, message: 'Fondos insuficientes' }),
    );

    expect(state.submitting).toBe(false);
    expect(state.result).toBeNull();
    expect(state.errorStatus).toBe(422);
    expect(state.errorMessage).toBe('Fondos insuficientes');
  });

  it.each([400, 403, 404, 409, 422, 504])(
    'transferFailure preserves the exact status code %i (no lo normaliza)',
    (status) => {
      const state = transferReducer(
        initialTransferState,
        transferActions.transferFailure({ status, message: 'x' }),
      );
      expect(state.errorStatus).toBe(status);
    },
  );
});
