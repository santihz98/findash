import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { TransactionContext } from '../../../shared/database/transaction-context';
import {
  CreateTransactionData,
  ITransactionRepository,
} from '../domain/ports/transaction.repository.port';
import { Transaction } from '../domain/entities/transaction.entity';

@Injectable()
export class PrismaTransactionRepository implements ITransactionRepository {
  constructor(private readonly prisma: PrismaService) {}

  runInTransaction<T>(fn: (trx: TransactionContext) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((trx) => fn(trx));
  }

  // `trx` opcional (Sesión 6.5, ver ITransactionRepository): sin él, usa el
  // cliente Prisma de nivel superior directo — un `PrismaClient` es
  // estructuralmente compatible con `Prisma.TransactionClient` para los
  // métodos de modelo (`.transaction.create`, etc.), la única diferencia
  // real es que uno participa de un `$transaction` en curso y el otro no.
  async create(data: CreateTransactionData, trx?: TransactionContext): Promise<Transaction> {
    const client = (trx as Prisma.TransactionClient | undefined) ?? this.prisma;

    const row = await client.transaction.create({
      data: {
        originAccountId: data.originAccountId,
        destAccountId: data.destAccountId,
        amount: data.amount,
        commission: data.commission,
        authorizationCode: data.authorizationCode,
        idempotencyKey: data.idempotencyKey,
        status: data.status,
      },
    });

    return {
      id: row.id,
      originAccountId: row.originAccountId,
      destAccountId: row.destAccountId,
      amount: row.amount.toFixed(2), // ver nota en Account: nunca .toString()
      commission: row.commission?.toFixed(2) ?? null,
      authorizationCode: row.authorizationCode,
      status: row.status,
      createdAt: row.createdAt,
    };
  }

  async findById(id: string): Promise<Transaction | null> {
    const row = await this.prisma.transaction.findUnique({ where: { id } });
    if (!row) return null;

    return {
      id: row.id,
      originAccountId: row.originAccountId,
      destAccountId: row.destAccountId,
      amount: row.amount.toFixed(2),
      commission: row.commission?.toFixed(2) ?? null,
      authorizationCode: row.authorizationCode,
      status: row.status,
      createdAt: row.createdAt,
    };
  }
}
