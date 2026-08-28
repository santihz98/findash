import { AccountStatus, AccountType, TransactionStatus } from '@prisma/client';
import { ListMyTransactionsUseCase } from './list-my-transactions.use-case';
import { IAccountRepository } from '../../../accounts/domain/ports/account.repository.port';
import { ITransactionRepository } from '../../domain/ports/transaction.repository.port';
import { Account } from '../../../accounts/domain/entities/account.entity';
import { NoOriginAccountException } from '../../domain/exceptions/no-origin-account.exception';
import { TransactionWithDirection } from '../../domain/entities/transaction.entity';

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc-1',
    accountNumber: '1000000001',
    balance: '1000.00',
    accountType: AccountType.BASIC,
    status: AccountStatus.ACTIVE,
    avatarUrl: null,
    ...overrides,
  };
}

function makeTx(overrides: Partial<TransactionWithDirection> = {}): TransactionWithDirection {
  return {
    id: 'tx-1',
    originAccountId: 'acc-1',
    destAccountId: 'acc-2',
    amount: '100.00',
    commission: '2.00',
    authorizationCode: 'CODE1234567',
    status: TransactionStatus.COMPLETED,
    createdAt: new Date('2026-08-27T00:00:00.000Z'),
    direction: 'SENT',
    ...overrides,
  };
}

describe('ListMyTransactionsUseCase', () => {
  let accountRepository: jest.Mocked<Pick<IAccountRepository, 'findManyByUserId'>>;
  let transactionRepository: jest.Mocked<Pick<ITransactionRepository, 'findManyByAccountId'>>;
  let useCase: ListMyTransactionsUseCase;

  beforeEach(() => {
    accountRepository = { findManyByUserId: jest.fn() };
    transactionRepository = { findManyByAccountId: jest.fn() };
    useCase = new ListMyTransactionsUseCase(
      accountRepository as unknown as IAccountRepository,
      transactionRepository as unknown as ITransactionRepository,
    );
  });

  it('resuelve la cuenta del usuario desde userId y delega la consulta al repositorio de transacciones', async () => {
    accountRepository.findManyByUserId.mockResolvedValue([makeAccount({ id: 'acc-1' })]);
    transactionRepository.findManyByAccountId.mockResolvedValue({ data: [makeTx()], total: 1 });

    const result = await useCase.execute({ userId: 'user-1', page: 1, limit: 20 });

    expect(accountRepository.findManyByUserId).toHaveBeenCalledWith('user-1');
    expect(transactionRepository.findManyByAccountId).toHaveBeenCalledWith({
      accountId: 'acc-1',
      page: 1,
      limit: 20,
    });
    expect(result).toEqual({ data: [makeTx()], page: 1, limit: 20, total: 1, totalPages: 1 });
  });

  it('calcula totalPages a partir de total/limit', async () => {
    accountRepository.findManyByUserId.mockResolvedValue([makeAccount()]);
    transactionRepository.findManyByAccountId.mockResolvedValue({ data: [], total: 45 });

    const result = await useCase.execute({ userId: 'user-1', page: 2, limit: 20 });

    expect(result.totalPages).toBe(3);
  });

  it('lanza NoOriginAccountException si el usuario no tiene ninguna cuenta (mismo criterio que CreateTransferUseCase)', async () => {
    accountRepository.findManyByUserId.mockResolvedValue([]);

    await expect(useCase.execute({ userId: 'user-1', page: 1, limit: 20 })).rejects.toThrow(
      NoOriginAccountException,
    );
    expect(transactionRepository.findManyByAccountId).not.toHaveBeenCalled();
  });

  it('lanza NoOriginAccountException si el usuario tiene más de una cuenta', async () => {
    accountRepository.findManyByUserId.mockResolvedValue([
      makeAccount({ id: 'acc-1' }),
      makeAccount({ id: 'acc-2' }),
    ]);

    await expect(useCase.execute({ userId: 'user-1', page: 1, limit: 20 })).rejects.toThrow(
      NoOriginAccountException,
    );
    expect(transactionRepository.findManyByAccountId).not.toHaveBeenCalled();
  });
});
