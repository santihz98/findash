import { Prisma } from '@prisma/client';
import { ICommissionStrategy } from './commission-strategy.interface';

const FIXED_FEE = new Prisma.Decimal('5.00');

/** RN-03 — cuenta CORPORATE: $5 fijos, sin importar el monto (no escala:
 * $10 paga $5, $10,000 paga $5 — ver el test que prueba exactamente eso). */
export class CorporateCommissionStrategy implements ICommissionStrategy {
  calculate(_amount: Prisma.Decimal): Prisma.Decimal {
    return FIXED_FEE;
  }
}
