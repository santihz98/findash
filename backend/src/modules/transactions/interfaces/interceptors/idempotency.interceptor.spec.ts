import { BadRequestException, CallHandler, ConflictException, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';
import { TransactionStatus } from '@prisma/client';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IIdempotencyKeyRepository } from '../../domain/ports/idempotency-key.repository.port';
import { ITransactionRepository } from '../../domain/ports/transaction.repository.port';
import { Transaction } from '../../domain/entities/transaction.entity';

function makeContext(headers: Record<string, string | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

const sampleTransaction: Transaction = {
  id: 'tx-1',
  originAccountId: 'acc-a',
  destAccountId: 'acc-b',
  amount: '10.00',
  commission: '0.00',
  authorizationCode: 'ABC123',
  status: TransactionStatus.COMPLETED,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

// Unit tests con repos mockeados — complementan (no reemplazan) los tests
// de integración reales contra Postgres (idempotency.integration.spec.ts,
// que ya prueban el flujo end-to-end con el UNIQUE constraint de verdad).
// Acá se cubre puntualmente lo que esos tests, al resolver siempre rápido,
// nunca llegan a ejercitar: el poll efectivamente esperando entre
// intentos, y el corte por timeout (409) cuando la key nunca se completa.
describe('IdempotencyInterceptor', () => {
  let idempotencyKeyRepository: jest.Mocked<IIdempotencyKeyRepository>;
  let transactionRepository: jest.Mocked<ITransactionRepository>;
  let interceptor: IdempotencyInterceptor;

  beforeEach(() => {
    idempotencyKeyRepository = {
      claim: jest.fn(),
      // jest.fn() sin más devuelve `undefined` de forma síncrona, no una
      // Promise — release()/complete() son async en la interfaz real, así
      // que hace falta el default resuelto para que el código bajo test
      // (que hace `.then(...)` sobre lo que devuelven) no reciba
      // `undefined` y explote con un TypeError ajeno a lo que se está
      // probando.
      complete: jest.fn().mockResolvedValue(undefined),
      findTransactionId: jest.fn(),
      release: jest.fn().mockResolvedValue(undefined),
    };
    transactionRepository = {
      runInTransaction: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
    } as unknown as jest.Mocked<ITransactionRepository>;
    interceptor = new IdempotencyInterceptor(idempotencyKeyRepository, transactionRepository);
  });

  it('rechaza con 400 si falta el header X-Idempotency-Key', async () => {
    const next: CallHandler = { handle: jest.fn() };
    await expect(interceptor.intercept(makeContext({}), next)).rejects.toBeInstanceOf(BadRequestException);
    expect(next.handle).not.toHaveBeenCalled();
    expect(idempotencyKeyRepository.claim).not.toHaveBeenCalled();
  });

  it('rechaza con 400 si el header viene vacío / solo espacios', async () => {
    const next: CallHandler = { handle: jest.fn() };
    await expect(
      interceptor.intercept(makeContext({ 'x-idempotency-key': '   ' }), next),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('si reclama la key, deja correr next.handle() y completa la key con el id de la Transaction', async () => {
    idempotencyKeyRepository.claim.mockResolvedValue(true);
    const next: CallHandler = { handle: () => of(sampleTransaction) };

    const result$ = await interceptor.intercept(makeContext({ 'x-idempotency-key': 'k1' }), next);
    const result = await firstValueFrom(result$);

    expect(result).toEqual(sampleTransaction);
    expect(idempotencyKeyRepository.complete).toHaveBeenCalledWith('k1', 'tx-1');
  });

  it('si next.handle() falla, libera la key y re-lanza el error original (no lo swallowea)', async () => {
    idempotencyKeyRepository.claim.mockResolvedValue(true);
    const originalError = new Error('fondos insuficientes, por ejemplo');
    const next: CallHandler = { handle: () => throwError(() => originalError) };

    const result$ = await interceptor.intercept(makeContext({ 'x-idempotency-key': 'k2' }), next);
    await expect(firstValueFrom(result$)).rejects.toBe(originalError);

    expect(idempotencyKeyRepository.release).toHaveBeenCalledWith('k2');
    expect(idempotencyKeyRepository.complete).not.toHaveBeenCalled();
  });

  it('si la key ya está reclamada y ya tiene Transaction, devuelve la cacheada sin llamar next.handle()', async () => {
    idempotencyKeyRepository.claim.mockResolvedValue(false);
    idempotencyKeyRepository.findTransactionId.mockResolvedValue('tx-1');
    transactionRepository.findById.mockResolvedValue(sampleTransaction);
    const next: CallHandler = { handle: jest.fn() };

    const result$ = await interceptor.intercept(makeContext({ 'x-idempotency-key': 'k3' }), next);
    const result = await firstValueFrom(result$);

    expect(result).toEqual(sampleTransaction);
    expect(next.handle).not.toHaveBeenCalled();
  });

  describe('poll acotado (fake timers, sin esperar de verdad)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('si la key está reclamada pero todavía sin transactionId, espera y la encuentra en un intento posterior', async () => {
      idempotencyKeyRepository.claim.mockResolvedValue(false);
      idempotencyKeyRepository.findTransactionId
        .mockResolvedValueOnce(null) // 1er intento: la request original todavía no terminó
        .mockResolvedValueOnce('tx-1'); // 2do intento: ya terminó
      transactionRepository.findById.mockResolvedValue(sampleTransaction);
      const next: CallHandler = { handle: jest.fn() };

      const interceptPromise = interceptor.intercept(makeContext({ 'x-idempotency-key': 'k4' }), next);
      // Avanza el reloj falso lo suficiente para que el poll dispare al
      // menos un ciclo (100ms) sin esperar de verdad esos 100ms.
      await jest.advanceTimersByTimeAsync(200);

      const result$ = await interceptPromise;
      const result = await firstValueFrom(result$);

      expect(result).toEqual(sampleTransaction);
      expect(idempotencyKeyRepository.findTransactionId).toHaveBeenCalledTimes(2);
    });

    it('si nunca aparece la Transaction dentro del tiempo máximo, corta con 409 (no espera para siempre)', async () => {
      idempotencyKeyRepository.claim.mockResolvedValue(false);
      idempotencyKeyRepository.findTransactionId.mockResolvedValue(null); // nunca se completa
      const next: CallHandler = { handle: jest.fn() };

      const interceptPromise = interceptor
        .intercept(makeContext({ 'x-idempotency-key': 'k5' }), next)
        .catch((error: unknown) => error);

      // MAX_WAIT_MS ahora es 5000ms (RN-02, Sesión 6: ANTI_FRAUD_TIMEOUT_MS
      // 3000ms + TRANSACTIONAL_SAFETY_MARGIN_MS 2000ms) — ver el comentario
      // completo en idempotency.interceptor.ts.
      await jest.advanceTimersByTimeAsync(5500); // > MAX_WAIT_MS (5000ms)

      const result = await interceptPromise;
      expect(result).toBeInstanceOf(ConflictException);
    });
  });
});
