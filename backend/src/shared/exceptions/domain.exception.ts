/**
 * Base para excepciones de reglas de negocio (ej. RN-03/RN-04 en
 * transactions/). No importa nada de Nest/Express/Prisma — el dominio lanza
 * estas excepciones sin saber que terminan traducidas a una respuesta HTTP;
 * esa traducción vive en DomainExceptionFilter (shared/filters), que las
 * atrapa por esta clase base y lee `httpStatus`.
 *
 * Cada subclase declara su propio `httpStatus`: agregar una excepción de
 * dominio nueva nunca requiere tocar el filtro (Open/Closed, mismo espíritu
 * que el Strategy+Factory de comisiones).
 */
export abstract class DomainException extends Error {
  abstract readonly httpStatus: number;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
