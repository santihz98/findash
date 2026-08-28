import { createActionGroup, props } from '@ngrx/store';

import { ListTransactionsAuditQuery, ListTransactionsAuditResult } from './transactions-audit.model';

export const transactionsAuditActions = createActionGroup({
  source: 'TransactionsAudit',
  events: {
    'Load Transactions': props<{ query: ListTransactionsAuditQuery }>(),
    'Load Transactions Success': props<{ result: ListTransactionsAuditResult }>(),
    'Load Transactions Failure': props<{ error: string }>(),
  },
});
