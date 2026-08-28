import { createActionGroup, props } from '@ngrx/store';

import { ListMyTransactionsQuery, ListMyTransactionsResult } from './my-transactions.model';

export const myTransactionsActions = createActionGroup({
  source: 'MyTransactions',
  events: {
    'Load History': props<{ query: ListMyTransactionsQuery }>(),
    'Load History Success': props<{ result: ListMyTransactionsResult }>(),
    'Load History Failure': props<{ error: string }>(),
  },
});
