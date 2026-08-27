import { Prisma } from '@prisma/client';
import { ICommissionStrategy } from './commission-strategy.interface';

const RATE = new Prisma.Decimal('0.02'); // 2%

/** RN-03 — cuenta BASIC: comisión 2% del monto. */
export class BasicCommissionStrategy implements ICommissionStrategy {
  calculate(amount: Prisma.Decimal): Prisma.Decimal {
    // toDecimalPlaces(2, ROUND_HALF_UP): la comisión es dinero real que se
    // cobra, así que se redondea a centavos igual que cualquier monto
    // monetario — nunca se persiste con más de 2 decimales (Decimal(14,2)
    // en el schema). ROUND_HALF_UP (redondeo "normal") en vez de
    // ROUND_HALF_EVEN porque es el criterio más predecible/esperable para
    // el usuario final en un cobro, no hay ninguna razón regulatoria en
    // este proyecto para preferir banker's rounding.
    return amount.mul(RATE).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  }
}
