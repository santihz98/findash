import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('login() POSTs email/password to auth/login', () => {
    service.login('basic@findash.dev', 'Demo1234!').subscribe();

    const req = httpMock.expectOne('auth/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'basic@findash.dev', password: 'Demo1234!' });
    req.flush({ accessToken: 'a', refreshToken: 'r' });
  });

  it('me() GETs auth/me without an explicit header when no accessToken is passed', () => {
    service.me().subscribe();

    const req = httpMock.expectOne('auth/me');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({ id: '1', email: 'a@a.com', documentNumber: '1', role: 'CLIENT' });
  });

  it('me(accessToken) attaches an explicit Bearer header (bootstrapping before the store has the token)', () => {
    service.me('bootstrap-token').subscribe();

    const req = httpMock.expectOne('auth/me');
    expect(req.request.headers.get('Authorization')).toBe('Bearer bootstrap-token');
    req.flush({ id: '1', email: 'a@a.com', documentNumber: '1', role: 'CLIENT' });
  });

  it('refresh() POSTs refreshToken to auth/refresh', () => {
    service.refresh('refresh-1').subscribe();

    const req = httpMock.expectOne('auth/refresh');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ refreshToken: 'refresh-1' });
    req.flush({ accessToken: 'new-access' });
  });
});
