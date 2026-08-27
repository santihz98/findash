import { DomainException } from '../../../../shared/exceptions/domain.exception';

/**
 * 504 (Gateway Timeout) — decisión explícita, no el 422 que usan las demás
 * excepciones de este use case. Las otras (fondos insuficientes, misma
 * cuenta, etc.) son reglas de negocio: el request está bien formado pero
 * viola una regla, y reintentar con el mismo input SIEMPRE va a volver a
 * fallar — 422 comunica exactamente eso. Un timeout de anti-fraude es lo
 * opuesto: es una falla transitoria de una dependencia externa (el
 * "servicio anti-fraude"), no del request en sí — reintentar el mismo
 * request más tarde puede perfectamente funcionar. 504 es semánticamente
 * preciso para "esto actuó como gateway hacia un servicio externo que no
 * respondió a tiempo" (RFC 9110). Se descartó 408 (Request Timeout): ese
 * código es para cuando el SERVIDOR se cansó de esperar que el CLIENTE
 * termine de mandar el request — lo inverso de lo que pasa acá.
 */
export class AntiFraudTimeoutException extends DomainException {
  readonly httpStatus = 504;

  constructor() {
    super('El servicio anti-fraude no respondió a tiempo. Intenta nuevamente.');
  }
}
