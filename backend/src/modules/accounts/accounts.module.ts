import { Module } from '@nestjs/common';
import { AccountsController } from './interfaces/accounts.controller';
import { ListAccountsUseCase } from './application/use-cases/list-accounts.use-case';
import { GetMyAccountsUseCase } from './application/use-cases/get-my-accounts.use-case';
import { LookupAccountByNumberUseCase } from './application/use-cases/lookup-account-by-number.use-case';
import { PrismaAccountRepository } from './infrastructure/prisma-account.repository';
import { ACCOUNT_REPOSITORY } from './domain/ports/account.repository.port';

@Module({
  controllers: [AccountsController],
  providers: [
    ListAccountsUseCase,
    GetMyAccountsUseCase,
    LookupAccountByNumberUseCase,
    { provide: ACCOUNT_REPOSITORY, useClass: PrismaAccountRepository },
  ],
  // Sesión 4: TransactionsModule importa AccountsModule para inyectar
  // ACCOUNT_REPOSITORY en CreateTransferUseCase (lee/escribe balances).
  exports: [ACCOUNT_REPOSITORY],
})
export class AccountsModule {}
