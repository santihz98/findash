import { Inject, Injectable } from '@nestjs/common';
import {
  ACCOUNT_REPOSITORY,
  IAccountRepository,
} from '../../../accounts/domain/ports/account.repository.port';
import {
  ITransactionRepository,
  TRANSACTION_REPOSITORY,
} from '../../domain/ports/transaction.repository.port';
import { TransactionWithDirection } from '../../domain/entities/transaction.entity';
import { NoOriginAccountException } from '../../domain/exceptions/no-origin-account.exception';

export interface ListMyTransactionsCommand {
  /** userId del JWT — nunca un accountId libre del request (RN-04), mismo
   * criterio que CreateTransferCommand. */
  userId: string;
  page: number;
  limit: number;
}

export interface ListMyTransactionsResult {
  data: TransactionWithDirection[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * RF-02 (Sesión 17) — `GET /transactions/me`: historial de movimientos del
 * CLIENT autenticado, enviados o recibidos, incluyendo intentos fallidos.
 *
 * Resolución de la cuenta: **mismo patrón que `CreateTransferUseCase`**
 * (ver ese archivo) — el sistema asume que cada CLIENT tiene exactamente
 * una cuenta (Sesión 4), así que 0 o >1 cuentas reutiliza
 * `NoOriginAccountException` (422) en vez de una excepción nueva: es
 * exactamente la misma regla de negocio ("no hay una única cuenta con la
 * cual operar para este usuario"), no una regla distinta que justifique
 * duplicar el concepto. No se extrajo un helper compartido con
 * `CreateTransferUseCase` a propósito: son 4 líneas, y ese use case ya está
 * probado/desplegado — duplicarlas acá es más seguro que tocarlo sin
 * necesidad real (ver PROGRESS.md Sesión 17).
 */
@Injectable()
export class ListMyTransactionsUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accountRepository: IAccountRepository,
    @Inject(TRANSACTION_REPOSITORY) private readonly transactionRepository: ITransactionRepository,
  ) {}

  async execute(command: ListMyTransactionsCommand): Promise<ListMyTransactionsResult> {
    const ownedAccounts = await this.accountRepository.findManyByUserId(command.userId);
    if (ownedAccounts.length !== 1) {
      throw new NoOriginAccountException();
    }
    const accountId = ownedAccounts[0].id;

    const { data, total } = await this.transactionRepository.findManyByAccountId({
      accountId,
      page: command.page,
      limit: command.limit,
    });

    return {
      data,
      page: command.page,
      limit: command.limit,
      total,
      totalPages: Math.ceil(total / command.limit),
    };
  }
}
