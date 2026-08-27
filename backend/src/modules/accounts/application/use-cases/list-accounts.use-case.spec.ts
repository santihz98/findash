import { AccountStatus, AccountType } from '@prisma/client';
import { ListAccountsUseCase } from './list-accounts.use-case';
import { IAccountRepository } from '../../domain/ports/account.repository.port';
import { AccountWithOwner } from '../../domain/entities/account.entity';

function makeAccount(overrides: Partial<AccountWithOwner> = {}): AccountWithOwner {
  return {
    id: 'acc-1',
    accountNumber: '1000000001',
    balance: '1000.00',
    accountType: AccountType.BASIC,
    status: AccountStatus.ACTIVE,
    avatarUrl: null,
    documentNumber: '1010000002',
    email: 'basic@findash.dev',
    ...overrides,
  };
}

describe('ListAccountsUseCase', () => {
  let accountRepository: jest.Mocked<IAccountRepository>;
  let useCase: ListAccountsUseCase;

  beforeEach(() => {
    accountRepository = {
      findManyWithOwner: jest.fn(),
      findManyByUserId: jest.fn(),
      findById: jest.fn(),
      updateBalance: jest.fn(),
      findByIdForUpdate: jest.fn(),
    };
    useCase = new ListAccountsUseCase(accountRepository);
  });

  it('forwards page/limit/filters to the repository and shapes the paginated response', async () => {
    const accounts = [makeAccount(), makeAccount({ id: 'acc-2', accountNumber: '1000000002' })];
    accountRepository.findManyWithOwner.mockResolvedValue({ data: accounts, total: 45 });

    const result = await useCase.execute({
      page: 2,
      limit: 20,
      documentNumber: '1010',
      status: AccountStatus.ACTIVE,
    });

    expect(accountRepository.findManyWithOwner).toHaveBeenCalledWith({
      page: 2,
      limit: 20,
      documentNumber: '1010',
      status: AccountStatus.ACTIVE,
    });
    expect(result).toEqual({
      data: accounts,
      page: 2,
      limit: 20,
      total: 45,
      totalPages: 3, // ceil(45/20)
    });
  });

  it('computes totalPages correctly for an exact multiple of limit', async () => {
    accountRepository.findManyWithOwner.mockResolvedValue({ data: [], total: 40 });

    const result = await useCase.execute({ page: 1, limit: 20 });

    expect(result.totalPages).toBe(2);
  });

  it('returns an empty page (not an error) when there are no matches', async () => {
    accountRepository.findManyWithOwner.mockResolvedValue({ data: [], total: 0 });

    const result = await useCase.execute({ page: 1, limit: 20, documentNumber: '9999999999' });

    expect(result).toEqual({ data: [], page: 1, limit: 20, total: 0, totalPages: 0 });
  });

  it('works with only the documentNumber filter set', async () => {
    accountRepository.findManyWithOwner.mockResolvedValue({ data: [makeAccount()], total: 1 });

    await useCase.execute({ page: 1, limit: 20, documentNumber: '1010000002' });

    expect(accountRepository.findManyWithOwner).toHaveBeenCalledWith(
      expect.objectContaining({ documentNumber: '1010000002', status: undefined }),
    );
  });

  it('works with only the status filter set', async () => {
    accountRepository.findManyWithOwner.mockResolvedValue({ data: [makeAccount()], total: 1 });

    await useCase.execute({ page: 1, limit: 20, status: AccountStatus.BLOCKED });

    expect(accountRepository.findManyWithOwner).toHaveBeenCalledWith(
      expect.objectContaining({ status: AccountStatus.BLOCKED, documentNumber: undefined }),
    );
  });
});
