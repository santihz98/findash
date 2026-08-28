import { TransactionStatus } from '@prisma/client';
import { ListTransactionsUseCase } from './list-transactions.use-case';
import { ITransactionRepository } from '../../domain/ports/transaction.repository.port';
import { Transaction } from '../../domain/entities/transaction.entity';

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    originAccountId: 'acc-1',
    destAccountId: 'acc-2',
    amount: '100.00',
    commission: '2.00',
    authorizationCode: 'CODE1234567',
    status: TransactionStatus.COMPLETED,
    createdAt: new Date('2026-08-27T00:00:00.000Z'),
    ...overrides,
  };
}

describe('ListTransactionsUseCase', () => {
  let transactionRepository: jest.Mocked<Pick<ITransactionRepository, 'findManyAdmin'>>;
  let useCase: ListTransactionsUseCase;

  beforeEach(() => {
    transactionRepository = { findManyAdmin: jest.fn() };
    useCase = new ListTransactionsUseCase(transactionRepository as unknown as ITransactionRepository);
  });

  it('delega paginación y filtros tal cual al repositorio, sin transformarlos', async () => {
    transactionRepository.findManyAdmin.mockResolvedValue({ data: [makeTx()], total: 1 });

    const dateFrom = new Date('2026-08-01T00:00:00.000Z');
    const dateTo = new Date('2026-08-28T23:59:59.999Z');

    const result = await useCase.execute({
      page: 1,
      limit: 20,
      status: TransactionStatus.REJECTED,
      dateFrom,
      dateTo,
    });

    expect(transactionRepository.findManyAdmin).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      status: TransactionStatus.REJECTED,
      dateFrom,
      dateTo,
    });
    expect(result).toEqual({ data: [makeTx()], page: 1, limit: 20, total: 1, totalPages: 1 });
  });

  it('funciona sin ningún filtro (status/dateFrom/dateTo undefined)', async () => {
    transactionRepository.findManyAdmin.mockResolvedValue({ data: [], total: 0 });

    const result = await useCase.execute({ page: 1, limit: 20 });

    expect(transactionRepository.findManyAdmin).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      status: undefined,
      dateFrom: undefined,
      dateTo: undefined,
    });
    expect(result.totalPages).toBe(0);
  });

  it('calcula totalPages a partir de total/limit', async () => {
    transactionRepository.findManyAdmin.mockResolvedValue({ data: [], total: 101 });

    const result = await useCase.execute({ page: 3, limit: 20 });

    expect(result.totalPages).toBe(6);
  });
});
