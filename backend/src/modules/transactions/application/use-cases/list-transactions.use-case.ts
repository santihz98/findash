import { Inject, Injectable } from '@nestjs/common';
import { TransactionStatus } from '@prisma/client';
import {
  ITransactionRepository,
  TRANSACTION_REPOSITORY,
} from '../../domain/ports/transaction.repository.port';
import { Transaction } from '../../domain/entities/transaction.entity';

export interface ListTransactionsCommand {
  page: number;
  limit: number;
  status?: TransactionStatus;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface ListTransactionsResult {
  data: Transaction[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * RF-02 (Sesión 17) — `GET /transactions` (solo ADMIN): "auditar
 * transacciones", TODAS las de la plataforma sin scope de cuenta, con
 * filtros opcionales combinables por `status` y por rango de fechas.
 */
@Injectable()
export class ListTransactionsUseCase {
  constructor(
    @Inject(TRANSACTION_REPOSITORY) private readonly transactionRepository: ITransactionRepository,
  ) {}

  async execute(command: ListTransactionsCommand): Promise<ListTransactionsResult> {
    const { data, total } = await this.transactionRepository.findManyAdmin({
      page: command.page,
      limit: command.limit,
      status: command.status,
      dateFrom: command.dateFrom,
      dateTo: command.dateTo,
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
