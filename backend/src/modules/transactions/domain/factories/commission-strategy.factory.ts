import { AccountType } from '@prisma/client';
import { ICommissionStrategy } from '../strategies/commission-strategy.interface';
import { BasicCommissionStrategy } from '../strategies/basic-commission.strategy';
import { PremiumCommissionStrategy } from '../strategies/premium-commission.strategy';
import { CorporateCommissionStrategy } from '../strategies/corporate-commission.strategy';

/**
 * RN-03 (ARCHITECTURE.md 3.1). Agregar un tipo de cuenta nuevo (ej. VIP) es:
 * 1. `ALTER TYPE "AccountType" ADD VALUE 'VIP'` (migración aditiva, ver
 *    prisma/schema.prisma).
 * 2. Un archivo nuevo `domain/strategies/vip-commission.strategy.ts`.
 * 3. Un `case` nuevo acá.
 * `CreateTransferUseCase` no se toca — nunca conoce las strategies
 * concretas, solo `ICommissionStrategy`. Ver PROGRESS.md Sesión 4 para el
 * ejemplo completo de qué archivos se tocarían.
 */
export class CommissionStrategyFactory {
  static create(accountType: AccountType): ICommissionStrategy {
    switch (accountType) {
      case AccountType.BASIC:
        return new BasicCommissionStrategy();
      case AccountType.PREMIUM:
        return new PremiumCommissionStrategy();
      case AccountType.CORPORATE:
        return new CorporateCommissionStrategy();
      default: {
        // Exhaustividad en tiempo de compilación: si se agrega un
        // AccountType nuevo sin agregar su case acá, `accountType` deja de
        // ser asignable a `never` y TS marca error acá mismo.
        const exhaustiveCheck: never = accountType;
        throw new Error(`No hay CommissionStrategy registrada para AccountType "${exhaustiveCheck}"`);
      }
    }
  }
}
