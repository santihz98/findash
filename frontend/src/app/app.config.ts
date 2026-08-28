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
import { AuthEffects } from './state/auth/auth.effects';
import { authFeature } from './state/auth/auth.reducer';

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
    provideEffects([AuthEffects]),
    provideStoreDevtools({ maxAge: 25, logOnly: !isDevMode() }),
  ],
};
