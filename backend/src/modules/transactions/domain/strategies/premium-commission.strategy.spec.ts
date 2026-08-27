import { Prisma } from '@prisma/client';
import { PremiumCommissionStrategy } from './premium-commission.strategy';

describe('PremiumCommissionStrategy (RN-03: PREMIUM = 0%)', () => {
  const strategy = new PremiumCommissionStrategy();

  it('no cobra comisión sin importar el monto', () => {
    expect(strategy.calculate(new Prisma.Decimal('100')).toFixed(2)).toBe('0.00');
    expect(strategy.calculate(new Prisma.Decimal('10000')).toFixed(2)).toBe('0.00');
    expect(strategy.calculate(new Prisma.Decimal('0.01')).toFixed(2)).toBe('0.00');
  });
});
