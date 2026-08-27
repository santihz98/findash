import { GetKpisUseCase } from './get-kpis.use-case';
import { DashboardKpis, IDashboardRepository } from '../../domain/ports/dashboard.repository.port';

describe('GetKpisUseCase', () => {
  let dashboardRepository: jest.Mocked<IDashboardRepository>;
  let useCase: GetKpisUseCase;

  beforeEach(() => {
    dashboardRepository = {
      getKpis: jest.fn(),
      getVolumeByAccountType: jest.fn(),
    };
    useCase = new GetKpisUseCase(dashboardRepository);
  });

  it('devuelve exactamente lo que resuelve el repositorio, sin transformarlo', async () => {
    const kpis: DashboardKpis = { totalVolumeTransacted: '12345.67', failedOrRejectedCount: 3 };
    dashboardRepository.getKpis.mockResolvedValue(kpis);

    const result = await useCase.execute();

    expect(result).toBe(kpis);
    expect(dashboardRepository.getKpis).toHaveBeenCalledTimes(1);
    expect(dashboardRepository.getVolumeByAccountType).not.toHaveBeenCalled();
  });

  it('sin transacciones: el repo puede devolver ceros, el use case no los altera', async () => {
    const kpis: DashboardKpis = { totalVolumeTransacted: '0.00', failedOrRejectedCount: 0 };
    dashboardRepository.getKpis.mockResolvedValue(kpis);

    const result = await useCase.execute();

    expect(result).toEqual({ totalVolumeTransacted: '0.00', failedOrRejectedCount: 0 });
  });
});
