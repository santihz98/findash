import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { TransactionContext } from '../../../shared/database/transaction-context';
import {
  IAccountRepository,
  ListAccountsFilter,
  ListAccountsResult,
} from '../domain/ports/account.repository.port';
import { Account, AccountLookupResult, AccountWithOwner } from '../domain/entities/account.entity';

@Injectable()
export class PrismaAccountRepository implements IAccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** `trx` viene de ITransactionRepository.runInTransaction() (ver
   * modules/transactions) — acá es donde la capa de infraestructura sí sabe
   * que por debajo es un Prisma.TransactionClient. Sin `trx`, usa el
   * PrismaService normal (mismo comportamiento que antes de la Sesión 4). */
  private client(trx?: TransactionContext): PrismaService | Prisma.TransactionClient {
    return (trx as Prisma.TransactionClient | undefined) ?? this.prisma;
  }

  async findManyWithOwner(filter: ListAccountsFilter): Promise<ListAccountsResult> {
    const where: Prisma.AccountWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      // RF-03: el filtro "por Documento" vive en User, no en Account —
      // Account no tiene ningún campo de documento de identidad (ver
      // ARCHITECTURE.md y PROGRESS.md Sesión 1.5). Esto obliga al join
      // relacional `user: { documentNumber: ... }` que Prisma traduce a un
      // INNER JOIN real contra `users`, no un filtro sobre una columna
      // propia de `accounts`.
      ...(filter.documentNumber
        ? { user: { documentNumber: { startsWith: filter.documentNumber } } }
        : {}),
    };

    // Paginación real vía skip/take (LIMIT/OFFSET de Postgres) — no se trae
    // la tabla completa a memoria para recortarla en JS. `$transaction` con
    // dos queries (fila + count) para que el total sea consistente con el
    // mismo `where` en el mismo snapshot, sin dos round-trips no atómicos.
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.account.findMany({
        where,
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { documentNumber: true, email: true } } },
      }),
      this.prisma.account.count({ where }),
    ]);

    return {
      data: rows.map(
        (row): AccountWithOwner => ({
          id: row.id,
          accountNumber: row.accountNumber,
          // .toFixed(2), no .toString(): decimal.js recorta ceros a la
          // derecha por defecto (1000.00 -> "1000"), lo que rompe el
          // contrato de precisión fija que ya se decidió en el schema
          // (Decimal(14,2), ver prisma/schema.prisma). toFixed(2) respeta
          // esa escala siempre, sin redondear (el valor guardado ya tiene
          // como máximo 2 decimales).
          balance: row.balance.toFixed(2),
          accountType: row.accountType,
          status: row.status,
          avatarUrl: row.avatarUrl,
          documentNumber: row.user.documentNumber,
          email: row.user.email,
        }),
      ),
      total,
    };
  }

  async findManyByUserId(userId: string): Promise<Account[]> {
    const rows = await this.prisma.account.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map(
      (row): Account => ({
        id: row.id,
        accountNumber: row.accountNumber,
        balance: row.balance.toFixed(2), // ver comentario en findManyWithOwner
        accountType: row.accountType,
        status: row.status,
        avatarUrl: row.avatarUrl,
      }),
    );
  }

  async findById(id: string, trx?: TransactionContext): Promise<Account | null> {
    const row = await this.client(trx).account.findUnique({ where: { id } });
    if (!row) return null;

    return {
      id: row.id,
      accountNumber: row.accountNumber,
      balance: row.balance.toFixed(2),
      accountType: row.accountType,
      status: row.status,
      avatarUrl: row.avatarUrl,
    };
  }

  async updateBalance(id: string, newBalance: Prisma.Decimal, trx?: TransactionContext): Promise<void> {
    await this.client(trx).account.update({ where: { id }, data: { balance: newBalance } });
  }

  async findByIdForUpdate(id: string, trx: TransactionContext): Promise<Account | null> {
    // Prisma no expone FOR UPDATE por la API fluida (findUnique/findFirst no
    // tienen esa opción) — $queryRaw es la única vía. Tagged template, no
    // interpolación de string: `${id}` se manda como parámetro bindeado al
    // driver de Postgres, no se concatena en el SQL — así se evita SQL
    // injection igual que con la API fluida normal.
    const rows = await this.client(trx).$queryRaw<AccountRow[]>`
      SELECT id, account_number, balance, account_type, status, avatar_url
      FROM accounts
      WHERE id = ${id}
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      accountNumber: row.account_number,
      balance: row.balance.toFixed(2),
      accountType: row.account_type,
      status: row.status,
      avatarUrl: row.avatar_url,
    };
  }

  async findByAccountNumber(accountNumber: string): Promise<AccountLookupResult | null> {
    // `select` explícito, no `findUnique` + mapeo manual: así el propio
    // query nunca trae balance/userId a memoria, ni por descuido en un
    // cambio futuro de este método (ver comentario del puerto).
    return this.prisma.account.findUnique({
      where: { accountNumber },
      select: { id: true, accountNumber: true, accountType: true },
    });
  }
}

/** Forma de la fila tal como la devuelve $queryRaw — nombres de columna
 * snake_case literales (Prisma no los camelCasea en raw queries), a
 * diferencia de `Prisma.AccountGetPayload` que usa los nombres del schema. */
interface AccountRow {
  id: string;
  account_number: string;
  balance: Prisma.Decimal;
  account_type: Account['accountType'];
  status: Account['status'];
  avatar_url: string | null;
}
