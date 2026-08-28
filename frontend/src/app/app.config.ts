import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideEffects } from '@ngrx/effects';
import { provideStore } from '@ngrx/store';
import { provideStoreDevtools } from '@ngrx/store-devtools';

import { routes } from './app.routes';
import { provideAppConfigInitializer } from './core/config/config.initializer';
import { apiConfigInterceptor } from './core/interceptors/api-config.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Config en runtime ANTES de cualquier otro provider que dependa de
    // ella (el interceptor de HTTP, y a futuro cualquier feature) —
    // ver core/config/config.initializer.ts.
    provideAppConfigInitializer(),
    provideHttpClient(withInterceptors([apiConfigInterceptor])),
    // Store raíz vacío por ahora — los features (auth/, accounts/, etc.)
    // se registran cada uno en state/, sin tocar este archivo.
    provideStore({}),
    provideEffects([]),
    provideStoreDevtools({ maxAge: 25, logOnly: !isDevMode() }),
  ],
};
