import { DomainException } from '../../../../shared/exceptions/domain.exception';

/** 422: el request es válido, pero la cuenta origen no tiene fondos
 * suficientes para cubrir monto + comisión. */
export class InsufficientFundsException extends DomainException {
  readonly httpStatus = 422;

  constructor() {
    super('Fondos insuficientes para completar la transferencia');
  }
}
