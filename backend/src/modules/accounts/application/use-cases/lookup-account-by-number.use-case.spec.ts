import { AccountType } from '@prisma/client';
import { LookupAccountByNumberUseCase } from './lookup-account-by-number.use-case';
import { IAccountRepository } from '../../domain/ports/account.repository.port';
import { AccountLookupResult } from '../../domain/entities/account.entity';
import { DestinationAccountNotFoundException } from '../../../transactions/domain/exceptions/destination-account-not-found.exception';

describe('LookupAccountByNumberUseCase', () => {
  let accountRepository: jest.Mocked<IAccountRepository>;
  let useCase: LookupAccountByNumberUseCase;

  beforeEach(() => {
    accountRepository = {
      findManyWithOwner: jest.fn(),
      findManyByUserId: jest.fn(),
      findById: jest.fn(),
      updateBalance: jest.fn(),
      findByIdForUpdate: jest.fn(),
      findByAccountNumber: jest.fn(),
    };
    useCase = new LookupAccountByNumberUseCase(accountRepository);
  });

  it('resuelve accountNumber -> {id, accountNumber, accountType}, delegando tal cual al repositorio', async () => {
    const result: AccountLookupResult = {
      id: 'acc-1',
      accountNumber: '1000000003',
      accountType: AccountType.PREMIUM,
    };
    accountRepository.findByAccountNumber.mockResolvedValue(result);

    const found = await useCase.execute('1000000003');

    expect(accountRepository.findByAccountNumber).toHaveBeenCalledWith('1000000003');
    expect(found).toBe(result);
  });

  it('nunca incluye balance, documentNumber ni email en la respuesta (campos ausentes, no solo correctos)', async () => {
    const result: AccountLookupResult = {
      id: 'acc-1',
      accountNumber: '1000000003',
      accountType: AccountType.PREMIUM,
    };
    accountRepository.findByAccountNumber.mockResolvedValue(result);

    const found = await useCase.execute('1000000003');

    expect(found).not.toHaveProperty('balance');
    expect(found).not.toHaveProperty('documentNumber');
    expect(found).not.toHaveProperty('email');
    expect(found).not.toHaveProperty('status');
    expect(Object.keys(found).sort()).toEqual(['accountNumber', 'accountType', 'id']);
  });

  it('lanza DestinationAccountNotFoundException (404) si no existe ninguna cuenta con ese accountNumber', async () => {
    accountRepository.findByAccountNumber.mockResolvedValue(null);

    await expect(useCase.execute('no-existe')).rejects.toThrow(DestinationAccountNotFoundException);
  });
});
