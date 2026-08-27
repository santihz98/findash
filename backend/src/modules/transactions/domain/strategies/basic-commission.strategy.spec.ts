import { Prisma } from '@prisma/client';
import { BasicCommissionStrategy } from './basic-commission.strategy';

describe('BasicCommissionStrategy (RN-03: BASIC = 2%)', () => {
  const strategy = new BasicCommissionStrategy();

  it('cobra exactamente 2% sobre un monto redondo', () => {
    const commission = strategy.calculate(new Prisma.Decimal('100'));
    expect(commission.toFixed(2)).toBe('2.00');
  });

  it('cobra 2% sobre un monto con decimales y redondea a 2 decimales', () => {
    // 33.33 * 0.02 = 0.6666 -> redondea a 0.67
    const commission = strategy.calculate(new Prisma.Decimal('33.33'));
    expect(commission.toFixed(2)).toBe('0.67');
  });

  it('escala con el monto (no es un monto fijo)', () => {
    const small = strategy.calculate(new Prisma.Decimal('10'));
    const large = strategy.calculate(new Prisma.Decimal('10000'));
    expect(small.toFixed(2)).toBe('0.20');
    expect(large.toFixed(2)).toBe('200.00');
  });

  it('nunca devuelve más de 2 decimales', () => {
    const commission = strategy.calculate(new Prisma.Decimal('0.01'));
    expect(commission.decimalPlaces()).toBeLessThanOrEqual(2);
  });
});
