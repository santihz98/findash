import { AccountStatus, AccountType, TransactionStatus } from '@prisma/client';
import { CreateTransferUseCase } from './create-transfer.use-case';
import { IAccountRepository } from '../../../accounts/domain/ports/account.repository.port';
import { ITransactionRepository } from '../../domain/ports/transaction.repository.port';
import { ANTI_FRAUD_TIMEOUT_MS, IAntiFraudService } from '../../domain/ports/anti-fraud.service.port';
import { AuthorizationCodeGeneratorService } from '../services/authorization-code-generator.service';
import { Account } from '../../../accounts/domain/entities/account.entity';
import { InsufficientFundsException } from '../../domain/exceptions/insufficient-funds.exception';
import { DestinationAccountNotFoundException } from '../../domain/exceptions/destination-account-not-found.exception';
import { SameAccountTransferException } from '../../domain/exceptions/same-account-transfer.exception';
import { NoOriginAccountException } from '../../domain/exceptions/no-origin-account.exception';
import { AntiFraudTimeoutException } from '../../domain/exceptions/anti-fraud-timeout.exception';

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'origin-1',
    accountNumber: '1000000001',
    balance: '1000.00',
    accountType: AccountType.BASIC,
    status: AccountStatus.ACTIVE,
    avatarUrl: null,
    ...overrides,
  };
}

describe('CreateTransferUseCase', () => {
  let accountRepository: jest.Mocked<IAccountRepository>;
  let transactionRepository: jest.Mocked<ITransactionRepository>;
  let antiFraudService: jest.Mocked<IAntiFraudService>;
  let authCodeGenerator: jest.Mocked<AuthorizationCodeGeneratorService>;
  let useCase: CreateTransferUseCase;

  beforeEach(() => {
    accountRepository = {
      findManyWithOwner: jest.fn(),
      findManyByUserId: jest.fn(),
      findById: jest.fn(),
      updateBalance: jest.fn(),
      findByIdForUpdate: jest.fn(),
    };
    // runInTransaction real (no mock trivial): así se ejercita el mismo
    // flujo async que corre en producción, con un `trx` opaco cualquiera.
    transactionRepository = {
      runInTransaction: jest.fn((fn: (trx: unknown) => Promise<unknown>) => fn('fake-trx')),
      create: jest.fn(),
      findById: jest.fn(),
    } as unknown as jest.Mocked<ITransactionRepository>;
    // Por defecto resuelve al toque — los tests de RN-02 más abajo
    // sobreescriben esto puntualmente para simular la respuesta lenta.
    antiFraudService = { check: jest.fn().mockResolvedValue(undefined) };
    authCodeGenerator = { generate: jest.fn().mockReturnValue('AUTHCODE1234') } as unknown as jest.Mocked<AuthorizationCodeGeneratorService>;

    useCase = new CreateTransferUseCase(accountRepository, transactionRepository, antiFraudService, authCodeGenerator);
  });

  function mockOwnership(origin: Account) {
    accountRepository.findManyByUserId.mockResolvedValue([origin]);
  }

  // RNF-01: el use case ahora bloquea con findByIdForUpdate (no findById) —
  // el fake resuelve por id sin importar el orden en que se pida.
  function mockAccounts(origin: Account, dest: Account) {
    accountRepository.findByIdForUpdate.mockImplementation(async (id) => {
      if (id === origin.id) return origin;
      if (id === dest.id) return dest;
      return null;
    });
  }

  function makeTransactionCreateStub() {
    let nextId = 1;
    transactionRepository.create.mockImplementation(async (data) => ({
      id: `tx-${nextId++}`,
      originAccountId: data.originAccountId,
      destAccountId: data.destAccountId,
      amount: data.amount.toFixed(2),
      commission: data.commission?.toFixed(2) ?? null,
      authorizationCode: data.authorizationCode,
      status: data.status,
      createdAt: new Date(),
    }));
  }

  it('BASIC: transferir $100 descuenta $102.00 del origen y acredita $100.00 al destino', async () => {
    const origin = makeAccount({ id: 'origin-1', accountType: AccountType.BASIC, balance: '1000.00' });
    const dest = makeAccount({ id: 'dest-1', accountType: AccountType.PREMIUM, balance: '500.00' });
    mockOwnership(origin);
    mockAccounts(origin, dest);
    makeTransactionCreateStub();

    const result = await useCase.execute({
      userId: 'user-1',
      destAccountId: 'dest-1',
      amount: '100',
      idempotencyKey: 'idem-basic',
    });

    expect(result.amount).toBe('100.00');
    expect(result.commission).toBe('2.00');
    expect(result.status).toBe(TransactionStatus.COMPLETED);

    // origen: 1000.00 - (100 + 2) = 898.00
    expect(accountRepository.updateBalance).toHaveBeenCalledWith(
      'origin-1',
      expect.objectContaining({ toFixed: expect.any(Function) }),
      'fake-trx',
    );
    const originNewBalance = accountRepository.updateBalance.mock.calls[0][1];
    expect(originNewBalance.toFixed(2)).toBe('898.00');

    // destino: 500.00 + 100 = 600.00
    const destNewBalance = accountRepository.updateBalance.mock.calls[1][1];
    expect(destNewBalance.toFixed(2)).toBe('600.00');

    // idempotencyKey persistida es la del command, no un valor inventado.
    expect(transactionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'idem-basic' }),
      'fake-trx',
    );
  });

  it('PREMIUM: transferir $100 descuenta exactamente $100.00 (sin comisión)', async () => {
    const origin = makeAccount({ id: 'origin-1', accountType: AccountType.PREMIUM, balance: '1000.00' });
    const dest = makeAccount({ id: 'dest-1', balance: '0.00' });
    mockOwnership(origin);
    mockAccounts(origin, dest);
    makeTransactionCreateStub();

    const result = await useCase.execute({
      userId: 'user-1',
      destAccountId: 'dest-1',
      amount: '100',
      idempotencyKey: 'idem-premium',
    });

    expect(result.commission).toBe('0.00');
    const originNewBalance = accountRepository.updateBalance.mock.calls[0][1];
    expect(originNewBalance.toFixed(2)).toBe('900.00'); // 1000 - 100 - 0
  });

  it('CORPORATE: cobra $5.00 fijo con $10 y con $10,000 (no escala)', async () => {
    const dest = makeAccount({ id: 'dest-1', balance: '0.00' });

    // $10
    const originSmall = makeAccount({ id: 'origin-small', accountType: AccountType.CORPORATE, balance: '1000.00' });
    mockOwnership(originSmall);
    mockAccounts(originSmall, dest);
    makeTransactionCreateStub();
    const smallResult = await useCase.execute({
      userId: 'user-small',
      destAccountId: 'dest-1',
      amount: '10',
      idempotencyKey: 'idem-corp-small',
    });
    expect(smallResult.commission).toBe('5.00');

    // $10,000
    const originLarge = makeAccount({ id: 'origin-large', accountType: AccountType.CORPORATE, balance: '100000.00' });
    mockOwnership(originLarge);
    mockAccounts(originLarge, dest);
    const largeResult = await useCase.execute({
      userId: 'user-large',
      destAccountId: 'dest-1',
      amount: '10000',
      idempotencyKey: 'idem-corp-large',
    });
    expect(largeResult.commission).toBe('5.00'); // el fijo no escala
  });

  // RF-07 (Sesión 6.5): estos 3 casos ahora SÍ llaman a
  // transactionRepository.create — persisten una fila de auditoría
  // REJECTED/FAILED antes de relanzar la excepción de dominio de siempre.
  // Ver la clasificación completa en create-transfer.use-case.ts.
  describe('RF-07 (Sesión 6.5): auditoría de transferencias fallidas/rechazadas', () => {
    it('fondos insuficientes: persiste REJECTED con commission calculada pero SIN tocar balances ni generar authorizationCode/idempotencyKey', async () => {
      const origin = makeAccount({ id: 'origin-1', accountType: AccountType.BASIC, balance: '50.00' });
      const dest = makeAccount({ id: 'dest-1', balance: '0.00' });
      mockOwnership(origin);
      mockAccounts(origin, dest);
      makeTransactionCreateStub();

      // 50 < 100 + 2% comisión (102) -> insuficiente
      await expect(
        useCase.execute({ userId: 'user-1', destAccountId: 'dest-1', amount: '100', idempotencyKey: 'idem-insuf' }),
      ).rejects.toBeInstanceOf(InsufficientFundsException);

      expect(accountRepository.updateBalance).not.toHaveBeenCalled();
      expect(transactionRepository.create).toHaveBeenCalledTimes(1);
      const [data, trx] = transactionRepository.create.mock.calls[0];
      expect(data.status).toBe(TransactionStatus.REJECTED);
      expect(data.originAccountId).toBe('origin-1');
      expect(data.destAccountId).toBe('dest-1'); // destino SÍ se confirmó real antes de la validación de fondos
      expect(data.commission?.toFixed(2)).toBe('2.00'); // ya se había calculado
      expect(data.authorizationCode).toBeNull();
      expect(data.idempotencyKey).toBeNull(); // nunca la key real en una fila fallida (Sesión 6.5)
      expect(trx).toBe('fake-trx'); // dentro de la misma transacción, sin abortarla (tarea 5)
    });

    it('destino inexistente: persiste REJECTED con destAccountId y commission NULL', async () => {
      const origin = makeAccount({ id: 'origin-1', balance: '1000.00' });
      mockOwnership(origin);
      accountRepository.findByIdForUpdate.mockImplementation(async (id) => (id === origin.id ? origin : null));
      makeTransactionCreateStub();

      await expect(
        useCase.execute({
          userId: 'user-1',
          destAccountId: 'does-not-exist',
          amount: '100',
          idempotencyKey: 'idem-404',
        }),
      ).rejects.toBeInstanceOf(DestinationAccountNotFoundException);

      expect(transactionRepository.create).toHaveBeenCalledTimes(1);
      const [data] = transactionRepository.create.mock.calls[0];
      expect(data.status).toBe(TransactionStatus.REJECTED);
      expect(data.originAccountId).toBe('origin-1');
      expect(data.destAccountId).toBeNull(); // nunca el id inexistente crudo — el FK lo rechazaría
      expect(data.commission).toBeNull(); // la Strategy nunca se resolvió (depende del destino)
      expect(data.authorizationCode).toBeNull();
      expect(data.idempotencyKey).toBeNull();
    });

    it('misma cuenta: persiste REJECTED con destAccountId = originAccountId, sin consultar accounts por id', async () => {
      const origin = makeAccount({ id: 'same-account', balance: '1000.00' });
      mockOwnership(origin);
      makeTransactionCreateStub();

      await expect(
        useCase.execute({
          userId: 'user-1',
          destAccountId: 'same-account',
          amount: '100',
          idempotencyKey: 'idem-same',
        }),
      ).rejects.toBeInstanceOf(SameAccountTransferException);
      // Ni siquiera debería haber consultado accounts por id — se corta antes.
      expect(accountRepository.findByIdForUpdate).not.toHaveBeenCalled();

      expect(transactionRepository.create).toHaveBeenCalledTimes(1);
      const [data, trx] = transactionRepository.create.mock.calls[0];
      expect(data.status).toBe(TransactionStatus.REJECTED);
      expect(data.originAccountId).toBe('same-account');
      expect(data.destAccountId).toBe('same-account'); // es la misma cuenta real, no un id sin confirmar
      expect(data.commission).toBeNull();
      expect(trx).toBeUndefined(); // INSERT suelto — ocurre antes de runInTransaction
    });
  });

  it('rechaza si el usuario no tiene exactamente una cuenta (0 cuentas)', async () => {
    accountRepository.findManyByUserId.mockResolvedValue([]);

    await expect(
      useCase.execute({
        userId: 'user-without-account',
        destAccountId: 'dest-1',
        amount: '100',
        idempotencyKey: 'idem-no-acc',
      }),
    ).rejects.toBeInstanceOf(NoOriginAccountException);
  });

  it('rechaza si el usuario tiene más de una cuenta (ambigüedad, no adivina)', async () => {
    accountRepository.findManyByUserId.mockResolvedValue([
      makeAccount({ id: 'acc-1' }),
      makeAccount({ id: 'acc-2' }),
    ]);

    await expect(
      useCase.execute({
        userId: 'user-with-2-accounts',
        destAccountId: 'dest-1',
        amount: '100',
        idempotencyKey: 'idem-multi-acc',
      }),
    ).rejects.toBeInstanceOf(NoOriginAccountException);
  });

  describe('RNF-01: orden determinístico de locks (por id ascendente)', () => {
    it('bloquea en orden ascendente cuando destId < originId', async () => {
      const origin = makeAccount({ id: 'zzz-origin', balance: '1000.00' });
      const dest = makeAccount({ id: 'aaa-dest', balance: '0.00' });
      mockOwnership(origin);
      mockAccounts(origin, dest);
      makeTransactionCreateStub();

      await useCase.execute({
        userId: 'user-1',
        destAccountId: 'aaa-dest',
        amount: '10',
        idempotencyKey: 'idem-order-1',
      });

      // "aaa-dest" < "zzz-origin" alfabéticamente -> se bloquea primero,
      // aunque sea el destino y no el origen.
      expect(accountRepository.findByIdForUpdate.mock.calls[0][0]).toBe('aaa-dest');
      expect(accountRepository.findByIdForUpdate.mock.calls[1][0]).toBe('zzz-origin');
    });

    it('bloquea en orden ascendente cuando originId < destId', async () => {
      const origin = makeAccount({ id: 'aaa-origin', balance: '1000.00' });
      const dest = makeAccount({ id: 'zzz-dest', balance: '0.00' });
      mockOwnership(origin);
      mockAccounts(origin, dest);
      makeTransactionCreateStub();

      await useCase.execute({
        userId: 'user-1',
        destAccountId: 'zzz-dest',
        amount: '10',
        idempotencyKey: 'idem-order-2',
      });

      expect(accountRepository.findByIdForUpdate.mock.calls[0][0]).toBe('aaa-origin');
      expect(accountRepository.findByIdForUpdate.mock.calls[1][0]).toBe('zzz-dest');
    });
  });

  describe('RN-02: anti-fraude', () => {
    it('respuesta rápida del anti-fraude no interfiere con el flujo normal', async () => {
      const origin = makeAccount({ id: 'origin-1', balance: '1000.00' });
      const dest = makeAccount({ id: 'dest-1', balance: '0.00' });
      mockOwnership(origin);
      mockAccounts(origin, dest);
      makeTransactionCreateStub();
      antiFraudService.check.mockResolvedValue(undefined);

      const result = await useCase.execute({
        userId: 'user-1',
        destAccountId: 'dest-1',
        amount: '100',
        idempotencyKey: 'idem-antifraud-ok',
      });

      expect(result.status).toBe(TransactionStatus.COMPLETED);
      expect(antiFraudService.check).toHaveBeenCalledWith({
        originAccountId: 'origin-1',
        destAccountId: 'dest-1',
        amount: '100',
      });
    });

    it('el anti-fraude se consulta ANTES que cualquier lock de cuenta', async () => {
      const origin = makeAccount({ id: 'origin-1', balance: '1000.00' });
      const dest = makeAccount({ id: 'dest-1', balance: '0.00' });
      mockOwnership(origin);
      makeTransactionCreateStub();

      const callOrder: string[] = [];
      antiFraudService.check.mockImplementation(async () => {
        callOrder.push('antifraud');
      });
      accountRepository.findByIdForUpdate.mockImplementation(async (id) => {
        callOrder.push(`lock:${id}`);
        if (id === origin.id) return origin;
        if (id === dest.id) return dest;
        return null;
      });

      await useCase.execute({
        userId: 'user-1',
        destAccountId: 'dest-1',
        amount: '10',
        idempotencyKey: 'idem-antifraud-order',
      });

      expect(callOrder[0]).toBe('antifraud');
      expect(callOrder.slice(1)).toEqual(['lock:dest-1', 'lock:origin-1']); // orden por id ascendente
    });

    it('si el anti-fraude no responde a tiempo, aborta con AntiFraudTimeoutException SIN tocar balances ni locks, pero SÍ persiste una fila FAILED', async () => {
      jest.useFakeTimers();
      try {
        const origin = makeAccount({ id: 'origin-1', balance: '1000.00' });
        mockOwnership(origin);
        makeTransactionCreateStub();
        // Nunca resuelve — el timeout de ANTI_FRAUD_TIMEOUT_MS es lo único
        // que puede terminar esta llamada.
        antiFraudService.check.mockReturnValue(new Promise(() => {}));

        const executePromise = useCase
          .execute({
            userId: 'user-1',
            destAccountId: 'dest-1',
            amount: '100',
            idempotencyKey: 'idem-antifraud-timeout',
          })
          .catch((error: unknown) => error);

        await jest.advanceTimersByTimeAsync(ANTI_FRAUD_TIMEOUT_MS + 100);

        const result = await executePromise;
        expect(result).toBeInstanceOf(AntiFraudTimeoutException);

        // Estado exactamente igual que antes del intento en lo que hace a
        // dinero: ni locks, ni balances tocados.
        expect(accountRepository.findByIdForUpdate).not.toHaveBeenCalled();
        expect(accountRepository.updateBalance).not.toHaveBeenCalled();

        // RF-07 (Sesión 6.5): sí queda una fila FAILED de auditoría, con
        // destAccountId/commission NULL (el destino nunca se confirmó
        // contra la base en este flujo).
        expect(transactionRepository.create).toHaveBeenCalledTimes(1);
        const [data, trx] = transactionRepository.create.mock.calls[0];
        expect(data.status).toBe(TransactionStatus.FAILED);
        expect(data.originAccountId).toBe('origin-1');
        expect(data.destAccountId).toBeNull();
        expect(data.commission).toBeNull();
        expect(data.authorizationCode).toBeNull();
        expect(data.idempotencyKey).toBeNull();
        expect(trx).toBeUndefined(); // INSERT suelto — ocurre antes de runInTransaction
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
