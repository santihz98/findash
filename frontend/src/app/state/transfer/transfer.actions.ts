import { createActionGroup, props } from '@ngrx/store';

import { TransferResult } from './transfer.model';

export const transferActions = createActionGroup({
  source: 'Transfer',
  events: {
    'Submit Transfer': props<{ destAccountId: string; amount: string; idempotencyKey: string }>(),
    'Transfer Success': props<{ result: TransferResult }>(),
    'Transfer Failure': props<{ status: number; message: string }>(),
  },
});
