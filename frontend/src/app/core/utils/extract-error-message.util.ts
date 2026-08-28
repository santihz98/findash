import { HttpErrorResponse } from '@angular/common/http';

/**
 * El body de error del backend NestJS es `{ statusCode, message, error }`
 * (ver `DomainExceptionFilter`/`ValidationPipe` en backend/) — `message` es
 * un string para errores de dominio (ej. "Credenciales inválidas") pero un
 * array de strings para errores de validación de `class-validator`. Se
 * muestra tal cual pide la tarea 7 ("muestra el error del backend tal
 * cual"), sin reescribirlo — solo se aplana el caso array (join) y se cubre
 * el caso sin conexión al backend en absoluto (`error.error` no es un
 * objeto con `message`, ej. el backend está caído).
 */
export function extractErrorMessage(error: HttpErrorResponse, fallback: string): string {
  const body: unknown = error.error;

  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message)) {
      return message.join(', ');
    }
  }

  return fallback;
}
