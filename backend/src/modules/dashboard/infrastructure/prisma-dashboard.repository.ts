import { Injectable } from '@nestjs/common';
import { AccountType, Prisma, TransactionStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { AccountTypeVolume, DashboardKpis, IDashboardRepository } from '../domain/ports/dashboard.repository.port';

@Injectable()
export class PrismaDashboardRepository implements IDashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  // RF-07 — dos agregaciones de Postgres (SUM + COUNT), no dos SELECT * que
  // se sumen/cuenten en JS: `aggregate`/`count` de Prisma compilan a
  // SUM(amount)/COUNT(*) reales con el WHERE aplicado en la base, sin traer
  // ninguna fila de `transactions` a memoria. `Promise.all`: son dos
  // queries independientes, no hay razón para serializarlas.
  async getKpis(): Promise<DashboardKpis> {
    const [volumeAgg, failedOrRejectedCount] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: { status: TransactionStatus.COMPLETED },
        _sum: { amount: true },
      }),
      this.prisma.transaction.count({
        where: { status: { in: [TransactionStatus.REJECTED, TransactionStatus.FAILED] } },
      }),
    ]);

    return {
      // _sum.amount es `null` (no 0) cuando no hay ninguna fila COMPLETED
      // — Postgres SUM() de un conjunto vacío es NULL, no 0. Sin este
      // fallback, un dashboard sin transacciones todavía se rompería
      // intentando .toFixed(2) sobre null (criterio de aceptación
      // explícito: "Sin transacciones: KPIs en cero, no error").
      totalVolumeTransacted: (volumeAgg._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
      failedOrRejectedCount,
    };
  }

  // RF-08 — `groupBy` de Prisma no puede agrupar por un campo de una
  // relación (`accountType` vive en Account, no en Transaction) — ver
  // PROGRESS.md Sesión 7 para la comparación completa contra la alternativa
  // de "dos queries + reduce en memoria". Se eligió $queryRaw con JOIN,
  // mismo criterio de seguridad que `findByIdForUpdate`
  // (prisma-account.repository.ts, Sesión 5): tagged template, ningún
  // input del usuario se interpola en el SQL (este endpoint no recibe
  // ningún parámetro, así que no hay ni siquiera un valor externo que
  // bindear), y el JOIN + GROUP BY + SUM corren enteramente en Postgres.
  // Solo COMPLETED (mismo criterio que getKpis, ver PROGRESS.md Sesión 7):
  // un tipo de cuenta sin transferencias completadas no aparece en el
  // resultado, no aparece con 0 — el WHERE lo excluye antes del GROUP BY.
  async getVolumeByAccountType(): Promise<AccountTypeVolume[]> {
    const rows = await this.prisma.$queryRaw<AccountTypeVolumeRow[]>`
      SELECT a.account_type AS "accountType", SUM(t.amount) AS "totalVolume"
      FROM transactions t
      JOIN accounts a ON a.id = t.origin_account_id
      WHERE t.status = 'COMPLETED'
      GROUP BY a.account_type
      ORDER BY a.account_type
    `;

    return rows.map((row) => ({
      accountType: row.accountType,
      totalVolume: row.totalVolume.toFixed(2),
    }));
  }
}

/** Forma de la fila tal como la devuelve $queryRaw — ver el mismo patrón en
 * prisma-account.repository.ts (`AccountRow`). Acá los alias ya vienen en
 * camelCase porque se declaran explícitamente en el SELECT (`AS
 * "accountType"`), a diferencia de las columnas snake_case nativas de esa
 * otra query. */
interface AccountTypeVolumeRow {
  accountType: AccountType;
  totalVolume: Prisma.Decimal;
}
