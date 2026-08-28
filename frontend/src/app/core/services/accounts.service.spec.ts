import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AccountsService } from './accounts.service';

describe('AccountsService', () => {
  let service: AccountsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AccountsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('list() always sends page and limit', () => {
    service.list({ page: 2, limit: 10 }).subscribe();

    const req = httpMock.expectOne((r) => r.url === 'accounts');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('limit')).toBe('10');
    expect(req.request.params.has('documentNumber')).toBe(false);
    expect(req.request.params.has('status')).toBe(false);
    req.flush({ data: [], page: 2, limit: 10, total: 0, totalPages: 0 });
  });

  it('list() adds documentNumber and status only when provided', () => {
    service.list({ page: 1, limit: 20, documentNumber: '1010000', status: 'ACTIVE' }).subscribe();

    const req = httpMock.expectOne((r) => r.url === 'accounts');
    expect(req.request.params.get('documentNumber')).toBe('1010000');
    expect(req.request.params.get('status')).toBe('ACTIVE');
    req.flush({ data: [], page: 1, limit: 20, total: 0, totalPages: 0 });
  });

  it('me() hits GET accounts/me and returns the array as-is (contrato real: array, no objeto único)', () => {
    let result: unknown;
    service.me().subscribe((r) => (result = r));

    const req = httpMock.expectOne((r) => r.url === 'accounts/me' && r.method === 'GET');
    const account = {
      id: 'acc-1',
      accountNumber: '1000000001',
      balance: '898.00',
      accountType: 'BASIC',
      status: 'ACTIVE',
      avatarUrl: null,
    };
    req.flush([account]);

    expect(result).toEqual([account]);
  });
});
