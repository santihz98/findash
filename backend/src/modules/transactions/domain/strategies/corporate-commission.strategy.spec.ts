import { Prisma } from '@prisma/client';
import { CorporateCommissionStrategy } from './corporate-commission.strategy';

describe('CorporateCommissionStrategy (RN-03: CORPORATE = $5 fijo)', () => {
  const strategy = new CorporateCommissionStrategy();

  it('cobra $5.00 fijo, no escala con el monto', () => {
    const small = strategy.calculate(new Prisma.Decimal('10'));
    const large = strategy.calculate(new Prisma.Decimal('10000'));

    expect(small.toFixed(2)).toBe('5.00');
    expect(large.toFixed(2)).toBe('5.00');
    expect(small.equals(large)).toBe(true); // literalmente el mismo valor
  });
});
