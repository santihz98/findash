import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DashboardService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('kpis() hits GET dashboard/kpis and returns the body as-is', () => {
    let result: unknown;
    service.kpis().subscribe((r) => (result = r));

    const req = httpMock.expectOne((r) => r.url === 'dashboard/kpis' && r.method === 'GET');
    const kpis = { totalVolumeTransacted: '434.00', failedOrRejectedCount: 48 };
    req.flush(kpis);

    expect(result).toEqual(kpis);
  });

  it('volumeByAccountType() hits GET dashboard/volume-by-account-type and returns the array as-is', () => {
    let result: unknown;
    service.volumeByAccountType().subscribe((r) => (result = r));

    const req = httpMock.expectOne(
      (r) => r.url === 'dashboard/volume-by-account-type' && r.method === 'GET',
    );
    const volume = [{ accountType: 'BASIC', totalVolume: '427.00' }];
    req.flush(volume);

    expect(result).toEqual(volume);
  });
});
