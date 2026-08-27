import { Prisma } from '@prisma/client';

/**
 * `Prisma.Decimal` en el dominio: mismo criterio ya documentado para el
 * enum `Role` en modules/auth (ver auth-user.entity.ts) — es un value type
 * puro (decimal.js), no acopla el dominio a PrismaClient/infraestructura.
 * Acá es más importante todavía: la comisión es aritmética financiera, y
 * mezclar `number` en cualquier punto reintroduce el problema de precisión
 * IEEE 754 que el schema ya evitó (ver prisma/schema.prisma).
 */
export interface ICommissionStrategy {
  calculate(amount: Prisma.Decimal): Prisma.Decimal;
}
