import { DomainException } from '../../../../shared/exceptions/domain.exception';

/** 422: la cuenta origen y destino son la misma. */
export class SameAccountTransferException extends DomainException {
  readonly httpStatus = 422;

  constructor() {
    super('La cuenta de origen y la cuenta destino no pueden ser la misma');
  }
}
