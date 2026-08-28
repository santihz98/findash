import { Injectable } from '@angular/core';

import { AppConfig } from './app-config.model';

/**
 * Carga assets/config.json en runtime (no build-time): la IP pública del
 * backend puede cambiar en cada redeploy de ECS Fargate (sin Load Balancer,
 * ver ARCHITECTURE.md sección 7), así que la URL no puede vivir en un
 * archivo que el bundler compile. `load()` corre una única vez, vía el
 * provider de app initializer, antes de que cualquier componente arranque.
 *
 * Usa `fetch()` nativo, no `HttpClient`: `ApiConfigInterceptor` (ver
 * core/interceptors) necesita `ConfigService.apiUrl` ya resuelto para poder
 * armar la URL absoluta de cualquier request — si esta carga pasara por el
 * mismo `HttpClient` interceptado, sería una dependencia circular (el
 * interceptor esperando una config que todavía no terminó de cargar).
 */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  private config: AppConfig | null = null;

  async load(): Promise<void> {
    const response = await fetch('assets/config.json');
    if (!response.ok) {
      throw new Error(
        `ConfigService: no se pudo cargar assets/config.json (HTTP ${response.status})`,
      );
    }
    this.config = (await response.json()) as AppConfig;
  }

  get apiUrl(): string {
    if (!this.config) {
      throw new Error(
        'ConfigService: config.json todavía no se cargó. ¿Falta el app initializer?',
      );
    }
    return this.config.apiUrl;
  }
}
