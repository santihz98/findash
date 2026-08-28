import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { CurrentUser } from '../../state/auth/auth.model';

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
}

/**
 * Único lugar que inyecta HttpClient para todo lo de auth (RNF-03) —
 * ningún componente ni el interceptor arman requests HTTP a mano.
 * Contrato verificado contra /api/docs-json del backend real desplegado
 * (no asumido de ARCHITECTURE.md a ciegas): POST /auth/login ->
 * { accessToken, refreshToken }, GET /auth/me (Bearer) -> { id, email,
 * documentNumber, role }, POST /auth/refresh -> { accessToken }.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>('auth/login', { email, password });
  }

  /**
   * `accessToken` es opcional y, si se pasa, se manda como header
   * explícito: se usa durante `login`/`restoreSession`, cuando todavía no
   * se despachó `loginSuccess`/`restoreSessionSuccess` y por lo tanto el
   * store no tiene el token que `jwtInterceptor` necesitaría leer para
   * adjuntarlo solo. Con el store ya poblado, no hace falta pasarlo —
   * el interceptor lo agrega.
   */
  me(accessToken?: string): Observable<CurrentUser> {
    const headers = accessToken
      ? new HttpHeaders({ Authorization: `Bearer ${accessToken}` })
      : undefined;
    return this.http.get<CurrentUser>('auth/me', { headers });
  }

  refresh(refreshToken: string): Observable<RefreshResponse> {
    return this.http.post<RefreshResponse>('auth/refresh', { refreshToken });
  }
}
