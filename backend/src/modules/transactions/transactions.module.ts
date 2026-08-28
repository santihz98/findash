import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { TransactionsController } from './interfaces/transactions.controller';
import { CreateTransferUseCase } from './application/use-cases/create-transfer.use-case';
import { ListMyTransactionsUseCase } from './application/use-cases/list-my-transactions.use-case';
import { ListTransactionsUseCase } from './application/use-cases/list-transactions.use-case';
import { AuthorizationCodeGeneratorService } from './application/services/authorization-code-generator.service';
import { PrismaTransactionRepository } from './infrastructure/prisma-transaction.repository';
import { TRANSACTION_REPOSITORY } from './domain/ports/transaction.repository.port';
import { PrismaIdempotencyKeyRepository } from './infrastructure/prisma-idempotency-key.repository';
import { IDEMPOTENCY_KEY_REPOSITORY } from './domain/ports/idempotency-key.repository.port';
import { IdempotencyInterceptor } from './interfaces/interceptors/idempotency.interceptor';
import { SimulatedAntiFraudAdapter } from './infrastructure/simulated-anti-fraud.adapter';
import { ANTI_FRAUD_SERVICE } from './domain/ports/anti-fraud.service.port';
import { RandomDelayProvider, DELAY_PROVIDER } from './infrastructure/random-delay.provider';

@Module({
  // AccountsModule exporta ACCOUNT_REPOSITORY (Sesión 4) — CreateTransferUseCase
  // lo necesita para leer/actualizar los balances de origen y destino.
  imports: [AccountsModule],
  controllers: [TransactionsController],
  providers: [
    CreateTransferUseCase,
    ListMyTransactionsUseCase,
    ListTransactionsUseCase,
    AuthorizationCodeGeneratorService,
    IdempotencyInterceptor,
    { provide: TRANSACTION_REPOSITORY, useClass: PrismaTransactionRepository },
    { provide: IDEMPOTENCY_KEY_REPOSITORY, useClass: PrismaIdempotencyKeyRepository },
    { provide: ANTI_FRAUD_SERVICE, useClass: SimulatedAntiFraudAdapter },
    // RandomDelayProvider real acá; los tests instancian
    // SimulatedAntiFraudAdapter/CreateTransferUseCase a mano con un fake
    // IDelayProvider en vez de pasar por este binding (ver PROGRESS.md
    // Sesión 6) — así son deterministas y rápidos.
    { provide: DELAY_PROVIDER, useClass: RandomDelayProvider },
  ],
})
export class TransactionsModule {}
