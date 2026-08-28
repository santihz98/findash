import { EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';

import { ConfigService } from './config.service';

/**
 * Resuelve config.json antes del bootstrap de la app (equivalente moderno
 * de APP_INITIALIZER para standalone apps, Angular 19+). Mientras esta
 * promesa no resuelve, Angular no renderiza ningún componente — no existe
 * forma de que la app arranque sin la config ya cargada.
 */
export function provideAppConfigInitializer(): EnvironmentProviders {
  return provideAppInitializer(() => {
    const configService = inject(ConfigService);
    return configService.load();
  });
}
