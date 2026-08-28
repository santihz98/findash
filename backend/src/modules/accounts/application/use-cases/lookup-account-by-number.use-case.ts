import { Inject, Injectable } from '@nestjs/common';
import { ACCOUNT_REPOSITORY, IAccountRepository } from '../../domain/ports/account.repository.port';
import { AccountLookupResult } from '../../domain/entities/account.entity';
import { DestinationAccountNotFoundException } from '../../../transactions/domain/exceptions/destination-account-not-found.exception';

@Injectable()
export class LookupAccountByNumberUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accountRepository: IAccountRepository,
  ) {}

  // Reusa DestinationAccountNotFoundException (definida en transactions/,
  // mismo mensaje/formato "cuenta destino ... no existe" que ya conoce el
  // resto del proyecto) en vez de inventar una excepción nueva para el
  // mismo caso: no existe ninguna cuenta con ese identificador. Es solo un
  // import de una clase de dominio (sin @Injectable, sin DI de Nest), no
  // un acoplamiento de módulos — TransactionsModule sigue siendo el único
  // que importa AccountsModule, no al revés.
  async execute(accountNumber: string): Promise<AccountLookupResult> {
    const account = await this.accountRepository.findByAccountNumber(accountNumber);
    if (!account) {
      throw new DestinationAccountNotFoundException(accountNumber);
    }
    return account;
  }
}
