import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { TransactionContext } from '../../../shared/database/transaction-context';
import {
  CreateTransactionData,
  ITransactionRepository,
  ListTransactionsAdminFilter,
  ListTransactionsByAccountFilter,
  PaginatedTransactions,
} from '../domain/ports/transaction.repository.port';
import { Transaction, TransactionWithDirection } from '../domain/entities/transaction.entity';

/** Forma cruda de una fila `transactions` tal como la devuelve Prisma
 * (`amount`/`commission` todavía `Prisma.Decimal`, no `string`) — el shape
 * que comparten `create`, `findUnique` y `findMany` de este modelo. */
type TransactionRow = Prisma.TransactionGetPayload<Record<string, never>>;

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

    return this.toEntity(row);
  }

  async findById(id: string): Promise<Transaction | null> {
    const row = await this.prisma.transaction.findUnique({ where: { id } });
    if (!row) return null;

    return this.toEntity(row);
  }

  // RF-02 (Sesión 17) — GET /transactions/me: OR sobre origen/destino, no
  // solo lo enviado. `$transaction` con dos queries (fila + count) mismo
  // patrón que PrismaAccountRepository.findManyWithOwner (Sesión 3): total
  // consistente con el mismo `where`, sin dos round-trips no atómicos.
  async findManyByAccountId(
    filter: ListTransactionsByAccountFilter,
  ): Promise<PaginatedTransactions<TransactionWithDirection>> {
    const where: Prisma.TransactionWhereInput = {
      OR: [{ originAccountId: filter.accountId }, { destAccountId: filter.accountId }],
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        // [createdAt desc, id asc] (Sesión 20): más reciente primero es el
        // orden correcto para un historial, pero createdAt solo no es
        // `@unique` — dos transferencias creadas en el mismo milisegundo
        // (fácil bajo test, no imposible en producción) son un empate real
        // sin ORDER BY, y Postgres no promete ningún orden estable entre
        // ellas de una llamada a otra bajo LIMIT/OFFSET (páginas que se
        // solapan o dejan huecos). `id` (PK, único) como segundo criterio
        // desempata sin alterar el orden por fecha que sí importa acá —
        // a diferencia de `Account.accountNumber`, `Transaction` no tiene
        // ningún identificador de negocio legible que sirva de orden
        // primario, así que el desempate usa la PK en vez de reemplazar el
        // criterio principal.
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data: rows.map((row) => ({
        ...this.toEntity(row),
        // 'SENT' si esta cuenta es el origen (cubre también el caso límite
        // de un self-transfer REJECTED donde origen == destino) — 'RECEIVED'
        // solo puede darse cuando el origen es OTRA cuenta real.
        direction: row.originAccountId === filter.accountId ? 'SENT' : ('RECEIVED' as const),
      })),
      total,
    };
  }

  // RF-02 (Sesión 17) — GET /transactions (solo ADMIN, auditoría): sin
  // scope de cuenta, filtros opcionales combinables por status y por rango
  // de fechas sobre `createdAt`.
  async findManyAdmin(filter: ListTransactionsAdminFilter): Promise<PaginatedTransactions<Transaction>> {
    const where: Prisma.TransactionWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.dateFrom || filter.dateTo
        ? {
            createdAt: {
              ...(filter.dateFrom ? { gte: filter.dateFrom } : {}),
              ...(filter.dateTo ? { lte: filter.dateTo } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        // Ver comentario de orderBy en findManyByAccountId (mismo criterio,
        // mismo motivo: desempate determinístico con `id` sobre un
        // `createdAt` no-único).
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return { data: rows.map((row) => this.toEntity(row)), total };
  }

  /** Mapeo Prisma -> entidad de dominio compartido por `create`/`findById`/
   * los dos listados nuevos — `.toFixed(2)`, nunca `.toString()` (ver nota
   * histórica en Account: `decimal.js` recorta ceros a la derecha). */
  private toEntity(row: TransactionRow): Transaction {
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
