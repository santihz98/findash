import { Prisma } from '@prisma/client';
import { ICommissionStrategy } from './commission-strategy.interface';

/** RN-03 — cuenta PREMIUM: sin comisión, sin importar el monto. */
export class PremiumCommissionStrategy implements ICommissionStrategy {
  calculate(_amount: Prisma.Decimal): Prisma.Decimal {
    return new Prisma.Decimal(0);
  }
}
