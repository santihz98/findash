import { AccountStatus, AccountType } from '@prisma/client';
import { GetMyAccountsUseCase } from './get-my-accounts.use-case';
import { IAccountRepository } from '../../domain/ports/account.repository.port';
import { Account } from '../../domain/entities/account.entity';

describe('GetMyAccountsUseCase', () => {
  let accountRepository: jest.Mocked<IAccountRepository>;
  let useCase: GetMyAccountsUseCase;

  beforeEach(() => {
    accountRepository = {
      findManyWithOwner: jest.fn(),
      findManyByUserId: jest.fn(),
      findById: jest.fn(),
      updateBalance: jest.fn(),
      findByIdForUpdate: jest.fn(),
      findByAccountNumber: jest.fn(),
    };
    useCase = new GetMyAccountsUseCase(accountRepository);
  });

  it('returns the accounts belonging to the given userId', async () => {
    const accounts: Account[] = [
      {
        id: 'acc-1',
        accountNumber: '1000000001',
        balance: '1000.00',
        accountType: AccountType.BASIC,
        status: AccountStatus.ACTIVE,
        avatarUrl: null,
      },
    ];
    accountRepository.findManyByUserId.mockResolvedValue(accounts);

    const result = await useCase.execute('user-1');

    expect(accountRepository.findManyByUserId).toHaveBeenCalledWith('user-1');
    expect(result).toBe(accounts);
  });

  it('returns an empty array for a user with no accounts', async () => {
    accountRepository.findManyByUserId.mockResolvedValue([]);

    const result = await useCase.execute('user-without-accounts');

    expect(result).toEqual([]);
  });
});
