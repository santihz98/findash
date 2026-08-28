import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ConfigService } from '../config/config.service';
import { apiConfigInterceptor } from './api-config.interceptor';

describe('apiConfigInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiConfigInterceptor])),
        provideHttpClientTesting(),
        { provide: ConfigService, useValue: { apiUrl: 'http://localhost:3000' } },
      ],
    });

    httpClient = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('prefixes a relative URL with the runtime apiUrl', () => {
    httpClient.get('auth/login').subscribe();

    const req = httpMock.expectOne('http://localhost:3000/auth/login');
    req.flush({});
  });

  it('prefixes a leading-slash relative URL without a double slash', () => {
    httpClient.get('/auth/login').subscribe();

    const req = httpMock.expectOne('http://localhost:3000/auth/login');
    req.flush({});
  });

  it('leaves already-absolute URLs untouched', () => {
    httpClient.get('http://other-service.example.com/ping').subscribe();

    const req = httpMock.expectOne('http://other-service.example.com/ping');
    req.flush({});
  });
});
