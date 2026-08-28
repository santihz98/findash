import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideEffects } from '@ngrx/effects';
import { provideState, provideStore } from '@ngrx/store';
import { provideStoreDevtools } from '@ngrx/store-devtools';

import { routes } from './app.routes';
import { provideAppConfigInitializer } from './core/config/config.initializer';
import { apiConfigInterceptor } from './core/interceptors/api-config.interceptor';
import { jwtInterceptor } from './core/interceptors/jwt.interceptor';
import { AccountLookupEffects } from './state/accountLookup/account-lookup.effects';
import { accountLookupFeature } from './state/accountLookup/account-lookup.reducer';
import { AccountsEffects } from './state/accounts/accounts.effects';
import { accountsFeature } from './state/accounts/accounts.reducer';
import { AuthEffects } from './state/auth/auth.effects';
import { authFeature } from './state/auth/auth.reducer';
import { DashboardEffects } from './state/dashboard/dashboard.effects';
import { dashboardFeature } from './state/dashboard/dashboard.reducer';
import { MyAccountEffects } from './state/myAccount/my-account.effects';
import { myAccountFeature } from './state/myAccount/my-account.reducer';
import { MyTransactionsEffects } from './state/myTransactions/my-transactions.effects';
import { myTransactionsFeature } from './state/myTransactions/my-transactions.reducer';
import { TransactionsAuditEffects } from './state/transactionsAudit/transactions-audit.effects';
import { transactionsAuditFeature } from './state/transactionsAudit/transactions-audit.reducer';
import { TransferEffects } from './state/transfer/transfer.effects';
import { transferFeature } from './state/transfer/transfer.reducer';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Config en runtime ANTES de cualquier otro provider que dependa de
    // ella (el interceptor de HTTP, y a futuro cualquier feature) —
    // ver core/config/config.initializer.ts.
    provideAppConfigInitializer(),
    // apiConfigInterceptor primero (resuelve la URL absoluta), después
    // jwtInterceptor (adjunta el header sobre esa URL ya resuelta).
    provideHttpClient(withInterceptors([apiConfigInterceptor, jwtInterceptor])),
    // Store raíz vacío — los features se registran cada uno en state/.
    provideStore({}),
    provideState(authFeature),
    provideState(accountsFeature),
    provideState(myAccountFeature),
    provideState(transferFeature),
    provideState(myTransactionsFeature),
    provideState(transactionsAuditFeature),
    provideState(accountLookupFeature),
    provideState(dashboardFeature),
    provideEffects([
      AuthEffects,
      AccountsEffects,
      MyAccountEffects,
      TransferEffects,
      MyTransactionsEffects,
      TransactionsAuditEffects,
      AccountLookupEffects,
      DashboardEffects,
    ]),
    provideStoreDevtools({ maxAge: 25, logOnly: !isDevMode() }),
  ],
};
