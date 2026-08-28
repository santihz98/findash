import { Injectable } from '@angular/core';

const ACCESS_TOKEN_KEY = 'findash.accessToken';
const REFRESH_TOKEN_KEY = 'findash.refreshToken';

/**
 * Único lugar que toca `localStorage` para los tokens de auth — ver la
 * decisión de almacenamiento documentada en PROGRESS.md (localStorage,
 * trade-off XSS aceptado explícitamente para esta demo de evaluación).
 * Envuelto en un service (no llamadas directas a `localStorage` desde
 * effects/interceptor/guards) para que sea mockeable en tests y para tener
 * un único punto que ajustar si la decisión cambia más adelante.
 *
 * Los `try/catch` no son manejo de errores especulativo: `localStorage`
 * puede lanzar de verdad (Safari en modo privado con cuota agotada, algunas
 * configuraciones de navegador que lo deshabilitan) — sin ellos, un login
 * exitoso podría tirar una excepción no capturada por un motivo ajeno a la
 * lógica de negocio. Fallar en silencio acá es aceptable: el store sigue
 * teniendo los tokens en memoria, solo se pierde la persistencia entre
 * refrescos de página.
 */
@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  setTokens(accessToken: string, refreshToken: string): void {
    this.setItem(ACCESS_TOKEN_KEY, accessToken);
    this.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }

  setAccessToken(accessToken: string): void {
    this.setItem(ACCESS_TOKEN_KEY, accessToken);
  }

  readAccessToken(): string | null {
    return this.getItem(ACCESS_TOKEN_KEY);
  }

  readRefreshToken(): string | null {
    return this.getItem(REFRESH_TOKEN_KEY);
  }

  clear(): void {
    try {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    } catch {
      // ver comentario de clase — falla en silencio a propósito.
    }
  }

  private setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ver comentario de clase — falla en silencio a propósito.
    }
  }

  private getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
}
