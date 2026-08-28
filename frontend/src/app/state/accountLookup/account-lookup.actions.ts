import { createActionGroup, props } from '@ngrx/store';

import { AccountLookupResult } from './account-lookup.model';

export const accountLookupActions = createActionGroup({
  source: 'Account Lookup',
  events: {
    'Lookup Account': props<{ accountNumber: string }>(),
    'Lookup Account Success': props<{ result: AccountLookupResult }>(),
    'Lookup Account Failure': props<{ message: string }>(),
  },
});
