import { RandomDelayProvider } from './random-delay.provider';

describe('RandomDelayProvider (RN-02: demora aleatoria 1-10s)', () => {
  const provider = new RandomDelayProvider();

  it('siempre devuelve un valor dentro de [1000, 10000] ms', () => {
    for (let i = 0; i < 200; i++) {
      const delay = provider.getDelayMs();
      expect(delay).toBeGreaterThanOrEqual(1000);
      expect(delay).toBeLessThanOrEqual(10000);
      expect(Number.isInteger(delay)).toBe(true);
    }
  });

  it('no siempre devuelve el mismo valor (es aleatorio, no una constante)', () => {
    const values = new Set(Array.from({ length: 20 }, () => provider.getDelayMs()));
    expect(values.size).toBeGreaterThan(1);
  });
});
