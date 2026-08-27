import { AccountType } from '@prisma/client';
import { GetVolumeByAccountTypeUseCase } from './get-volume-by-account-type.use-case';
import { AccountTypeVolume, IDashboardRepository } from '../../domain/ports/dashboard.repository.port';

describe('GetVolumeByAccountTypeUseCase', () => {
  let dashboardRepository: jest.Mocked<IDashboardRepository>;
  let useCase: GetVolumeByAccountTypeUseCase;

  beforeEach(() => {
    dashboardRepository = {
      getKpis: jest.fn(),
      getVolumeByAccountType: jest.fn(),
    };
    useCase = new GetVolumeByAccountTypeUseCase(dashboardRepository);
  });

  it('devuelve exactamente lo que resuelve el repositorio, sin transformarlo', async () => {
    const rows: AccountTypeVolume[] = [
      { accountType: AccountType.BASIC, totalVolume: '1234.56' },
      { accountType: AccountType.CORPORATE, totalVolume: '50000.00' },
    ];
    dashboardRepository.getVolumeByAccountType.mockResolvedValue(rows);

    const result = await useCase.execute();

    expect(result).toBe(rows);
    expect(dashboardRepository.getVolumeByAccountType).toHaveBeenCalledTimes(1);
    expect(dashboardRepository.getKpis).not.toHaveBeenCalled();
  });

  it('sin transacciones COMPLETED: array vacío, no un error', async () => {
    dashboardRepository.getVolumeByAccountType.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result).toEqual([]);
  });
});
