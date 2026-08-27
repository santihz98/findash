import { Inject, Injectable } from '@nestjs/common';
import {
  ACCOUNT_REPOSITORY,
  IAccountRepository,
} from '../../domain/ports/account.repository.port';
import { Account } from '../../domain/entities/account.entity';

@Injectable()
export class GetMyAccountsUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accountRepository: IAccountRepository,
  ) {}

  // Recibe el userId que ya extrajo JwtAuthGuard del JWT (nunca un id que
  // venga del cliente en el request) — así un CLIENT estructuralmente no
  // puede pedir las cuentas de otro usuario por este endpoint.
  execute(userId: string): Promise<Account[]> {
    return this.accountRepository.findManyByUserId(userId);
  }
}
