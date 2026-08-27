import { DomainException } from '../../../../shared/exceptions/domain.exception';

/** 404: la cuenta destino no existe. */
export class DestinationAccountNotFoundException extends DomainException {
  readonly httpStatus = 404;

  constructor(destAccountId: string) {
    super(`La cuenta destino "${destAccountId}" no existe`);
  }
}
