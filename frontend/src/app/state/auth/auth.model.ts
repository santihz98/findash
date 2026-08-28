/**
 * Contrato real de GET /auth/me (verificado contra /api/docs-json del
 * backend desplegado, no asumido) — nunca incluye `passwordHash`.
 */
export type Role = 'ADMIN' | 'CLIENT';

export interface CurrentUser {
  id: string;
  email: string;
  documentNumber: string;
  role: Role;
}

export interface AuthState {
  user: CurrentUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  loading: boolean;
  error: string | null;
  /**
   * true mientras `restoreSession` (chequeo de sesión persistida al
   * arrancar la app, ver auth.effects.ts) está en curso. Los guards
   * esperan a que pase a `false` antes de decidir — sin esto, un refresh
   * de página con sesión guardada en localStorage bloquearía rutas
   * protegidas por una carrera contra la llamada a GET /auth/me todavía
   * en vuelo. Default `false` (no `true`) a propósito: si `restoreSession`
   * nunca se despacha (tests aislados que no montan `App`), los guards no
   * se quedan esperando para siempre.
   */
  sessionRestoring: boolean;
}

export const initialAuthState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  loading: false,
  error: null,
  sessionRestoring: false,
};
