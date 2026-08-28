/**
 * Mapea cada código HTTP real de POST /transactions/transfer (tarea 5, "el
 * corazón de la sesión") a su propio mensaje y su propia acción posible —
 * nunca un catch-all. `message` es siempre el mensaje real del backend
 * (`extractErrorMessage`, ya aplicado en `transfer.effects.ts` antes de
 * llegar acá) mostrado tal cual, mismo criterio que `LoginPage` desde la
 * Sesión 13 — `helpText` es contexto ADICIONAL específico de FinDash que
 * el backend no manda (ej. la explicación de qué es RN-02), nunca un
 * reemplazo del mensaje real.
 *
 * `retryStrategy` es la decisión de UX más importante de esta sesión
 * (documentada también en PROGRESS.md): 504 (timeout de anti-fraude, RN-02
 * — falla transitoria de una dependencia externa) reintenta con una key
 * NUEVA, porque la key vieja sigue "en juego" del lado del backend hasta
 * que el `IdempotencyInterceptor` la libera; 409 (carrera de idempotencia
 * sin resolver a tiempo) reintenta con la MISMA key, porque el objetivo
 * es literalmente recuperar el resultado de ESE intento original, no
 * arrancar uno nuevo — son direcciones opuestas a propósito, no una
 * elección arbitraria.
 *
 * `variant`/`title`/`icon` (Sesión 16, presentación visual pura — no
 * cambian ningún criterio de negocio): agrupan los 6 códigos en 4
 * categorías que SÍ importan para el usuario ("¿puedo reintentar o tengo
 * que corregir algo?", "¿es un problema mío o del sistema?"), para que
 * TransferFormPage pueda pintar cada código de forma distinguible sin que
 * cada uno necesite un color completamente arbitrario propio:
 * - `blocked` (400/403): la solicitud en sí no es válida/autorizada.
 * - `validation` (404/422): el usuario tiene que corregir un dato.
 * - `timeout` (504): falla transitoria externa, reintentable con key nueva.
 * - `conflict` (409): operación propia en curso, reintentable con la misma key.
 */
export type TransferRetryStrategy = 'none' | 'new-key' | 'same-key';
export type TransferErrorVariant = 'blocked' | 'validation' | 'timeout' | 'conflict';

export interface TransferErrorPresentation {
  message: string;
  helpText: string | null;
  retryLabel: string | null;
  retryStrategy: TransferRetryStrategy;
  variant: TransferErrorVariant;
  title: string;
  icon: string;
}

export function describeTransferError(
  status: number,
  backendMessage: string,
): TransferErrorPresentation {
  switch (status) {
    case 504:
      return {
        message: backendMessage,
        helpText:
          'Es una verificación de seguridad automática (antifraude) que no llegó a responder a tiempo — no es que algo esté roto. Reintentar genera un intento nuevo, y puede perfectamente funcionar.',
        retryLabel: 'Reintentar',
        retryStrategy: 'new-key',
        variant: 'timeout',
        title: 'Verificación demorada',
        icon: '⏱',
      };
    case 409:
      return {
        message: backendMessage,
        helpText: 'Ya hay una transferencia en curso con este mismo intento — esperá un momento.',
        retryLabel: 'Reintentar',
        retryStrategy: 'same-key',
        variant: 'conflict',
        title: 'Transferencia en curso',
        icon: '⟳',
      };
    case 404:
      return {
        message: backendMessage,
        helpText: 'Revisá el id de la cuenta destino antes de volver a enviar el formulario.',
        retryLabel: null,
        retryStrategy: 'none',
        variant: 'validation',
        title: 'Cuenta destino no encontrada',
        icon: '🔍',
      };
    case 422:
      return {
        message: backendMessage,
        helpText: 'Revisá el monto y la cuenta destino antes de volver a enviar el formulario.',
        retryLabel: null,
        retryStrategy: 'none',
        variant: 'validation',
        title: 'No se puede completar la transferencia',
        icon: '⚠',
      };
    case 400:
      return {
        message: backendMessage,
        helpText: 'Revisá los datos del formulario.',
        retryLabel: null,
        retryStrategy: 'none',
        variant: 'blocked',
        title: 'Solicitud inválida',
        icon: '⛔',
      };
    case 403:
      return {
        message: backendMessage,
        helpText: 'Tu usuario no tiene permiso para transferir.',
        retryLabel: null,
        retryStrategy: 'none',
        variant: 'blocked',
        title: 'Sin autorización',
        icon: '⛔',
      };
    default:
      return {
        message: backendMessage,
        helpText: null,
        retryLabel: null,
        retryStrategy: 'none',
        variant: 'blocked',
        title: 'No se pudo completar',
        icon: '⛔',
      };
  }
}
