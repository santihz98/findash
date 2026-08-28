import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { TransactionHistoryService } from './transaction-history.service';

describe('TransactionHistoryService', () => {
  let service: TransactionHistoryService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TransactionHistoryService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('myHistory() always sends page and limit against transactions/me', () => {
    service.myHistory({ page: 2, limit: 10 }).subscribe();

    const req = httpMock.expectOne((r) => r.url === 'transactions/me');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('limit')).toBe('10');
    req.flush({ data: [], page: 2, limit: 10, total: 0, totalPages: 0 });
  });

  it('auditList() always sends page and limit against transactions, without status/dateFrom/dateTo when absent', () => {
    service.auditList({ page: 1, limit: 20 }).subscribe();

    const req = httpMock.expectOne((r) => r.url === 'transactions');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('limit')).toBe('20');
    expect(req.request.params.has('status')).toBe(false);
    expect(req.request.params.has('dateFrom')).toBe(false);
    expect(req.request.params.has('dateTo')).toBe(false);
    req.flush({ data: [], page: 1, limit: 20, total: 0, totalPages: 0 });
  });

  it('auditList() adds status/dateFrom/dateTo only when provided', () => {
    service
      .auditList({
        page: 1,
        limit: 20,
        status: 'REJECTED',
        dateFrom: '2026-08-01',
        dateTo: '2026-08-28T23:59:59.999Z',
      })
      .subscribe();

    const req = httpMock.expectOne((r) => r.url === 'transactions');
    expect(req.request.params.get('status')).toBe('REJECTED');
    expect(req.request.params.get('dateFrom')).toBe('2026-08-01');
    expect(req.request.params.get('dateTo')).toBe('2026-08-28T23:59:59.999Z');
    req.flush({ data: [], page: 1, limit: 20, total: 0, totalPages: 0 });
  });
});
