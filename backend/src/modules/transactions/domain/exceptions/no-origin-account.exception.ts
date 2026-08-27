import { DomainException } from '../../../../shared/exceptions/domain.exception';

/**
 * 422: el usuario autenticado no tiene exactamente una cuenta desde la
 * cual transferir. Ver PROGRESS.md Sesión 4 — el DTO de transferencia no
 * incluye `originAccountId` (RN-04: el origen sale del usuario autenticado,
 * nunca de un id libre del body), así que hoy el endpoint asume/requiere
 * que cada CLIENT tenga exactamente una cuenta. Con 0 cuentas no hay de
 * dónde transferir; con más de una, no hay forma de que el request
 * desambigüe cuál — en vez de adivinar (ej. "la primera"), se rechaza.
 */
export class NoOriginAccountException extends DomainException {
  readonly httpStatus = 422;

  constructor() {
    super('No se encontró una única cuenta de origen para este usuario');
  }
}
