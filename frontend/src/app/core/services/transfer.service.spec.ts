import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { TransferService } from './transfer.service';

describe('TransferService', () => {
  let service: TransferService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TransferService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('POSTs to transactions/transfer with the body and the X-Idempotency-Key header', () => {
    service.transfer('dest-1', '100.00', 'key-123').subscribe();

    const req = httpMock.expectOne((r) => r.url === 'transactions/transfer' && r.method === 'POST');
    expect(req.request.body).toEqual({ destAccountId: 'dest-1', amount: '100.00' });
    expect(req.request.headers.get('X-Idempotency-Key')).toBe('key-123');

    req.flush({
      id: 'tx-1',
      originAccountId: 'origin-1',
      destAccountId: 'dest-1',
      amount: '100.00',
      commission: '2.00',
      authorizationCode: 'ABC123',
      status: 'COMPLETED',
      createdAt: '2026-08-28T00:00:00.000Z',
    });
  });

  it('a different call carries a different key (never reused implicitly by the service)', () => {
    service.transfer('dest-1', '100.00', 'key-A').subscribe();
    service.transfer('dest-1', '100.00', 'key-B').subscribe();

    const reqs = httpMock.match((r) => r.url === 'transactions/transfer');
    expect(reqs).toHaveLength(2);
    expect(reqs[0].request.headers.get('X-Idempotency-Key')).toBe('key-A');
    expect(reqs[1].request.headers.get('X-Idempotency-Key')).toBe('key-B');
    reqs.forEach((r) =>
      r.flush({
        id: 'tx-1',
        originAccountId: 'origin-1',
        destAccountId: 'dest-1',
        amount: '100.00',
        commission: '2.00',
        authorizationCode: 'ABC123',
        status: 'COMPLETED',
        createdAt: '2026-08-28T00:00:00.000Z',
      }),
    );
  });
});
