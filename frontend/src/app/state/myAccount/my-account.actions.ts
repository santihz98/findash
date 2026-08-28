import { createActionGroup, emptyProps, props } from '@ngrx/store';

import { MyAccount } from './my-account.model';

export const myAccountActions = createActionGroup({
  source: 'MyAccount',
  events: {
    'Load My Account': emptyProps(),
    'Load My Account Success': props<{ account: MyAccount | null }>(),
    'Load My Account Failure': props<{ error: string }>(),
  },
});
