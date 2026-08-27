import { SimulatedAntiFraudAdapter } from './simulated-anti-fraud.adapter';
import { IDelayProvider } from './random-delay.provider';

describe('SimulatedAntiFraudAdapter', () => {
  it('resuelve después del delay que indique IDelayProvider (fake timers, sin esperar de verdad)', async () => {
    jest.useFakeTimers();
    try {
      const delayProvider: IDelayProvider = { getDelayMs: jest.fn().mockReturnValue(4242) };
      const adapter = new SimulatedAntiFraudAdapter(delayProvider);

      let resolved = false;
      const promise = adapter
        .check({ originAccountId: 'a', destAccountId: 'b', amount: '10.00' })
        .then(() => {
          resolved = true;
        });

      await jest.advanceTimersByTimeAsync(4000);
      expect(resolved).toBe(false); // todavía no pasaron los 4242ms

      await jest.advanceTimersByTimeAsync(300);
      await promise;
      expect(resolved).toBe(true);
      expect(delayProvider.getDelayMs).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
