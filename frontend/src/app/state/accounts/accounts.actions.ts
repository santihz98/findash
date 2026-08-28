import { createActionGroup, props } from '@ngrx/store';

import { ListAccountsQuery, ListAccountsResult } from './accounts.model';

export const accountsActions = createActionGroup({
  source: 'Accounts',
  events: {
    'Load Accounts': props<{ query: ListAccountsQuery }>(),
    'Load Accounts Success': props<{ result: ListAccountsResult }>(),
    'Load Accounts Failure': props<{ error: string }>(),
  },
});
