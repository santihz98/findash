import { AccountType } from '@prisma/client';
import { CommissionStrategyFactory } from './commission-strategy.factory';
import { BasicCommissionStrategy } from '../strategies/basic-commission.strategy';
import { PremiumCommissionStrategy } from '../strategies/premium-commission.strategy';
import { CorporateCommissionStrategy } from '../strategies/corporate-commission.strategy';

describe('CommissionStrategyFactory', () => {
  it('resuelve BasicCommissionStrategy para BASIC', () => {
    expect(CommissionStrategyFactory.create(AccountType.BASIC)).toBeInstanceOf(BasicCommissionStrategy);
  });

  it('resuelve PremiumCommissionStrategy para PREMIUM', () => {
    expect(CommissionStrategyFactory.create(AccountType.PREMIUM)).toBeInstanceOf(PremiumCommissionStrategy);
  });

  it('resuelve CorporateCommissionStrategy para CORPORATE', () => {
    expect(CommissionStrategyFactory.create(AccountType.CORPORATE)).toBeInstanceOf(CorporateCommissionStrategy);
  });

  it('lanza un error claro para un AccountType no registrado', () => {
    expect(() => CommissionStrategyFactory.create('VIP' as AccountType)).toThrow(
      /No hay CommissionStrategy registrada/,
    );
  });
});
