import { ConfigService } from '@nestjs/config';
import { parseCorsOrigins } from './cors.config';

describe('parseCorsOrigins', () => {
  it('parsea un CORS_ORIGIN con varios orígenes separados por coma a un array, sin espacios', () => {
    const configService = {
      getOrThrow: () =>
        'http://localhost:4200, http://findash-frontend-7874505.s3-website.us-east-2.amazonaws.com',
    } as unknown as ConfigService;

    expect(parseCorsOrigins(configService)).toEqual([
      'http://localhost:4200',
      'http://findash-frontend-7874505.s3-website.us-east-2.amazonaws.com',
    ]);
  });

  it('devuelve un array de un solo elemento cuando CORS_ORIGIN no tiene comas', () => {
    const configService = {
      getOrThrow: () => 'http://localhost:4200',
    } as unknown as ConfigService;

    expect(parseCorsOrigins(configService)).toEqual(['http://localhost:4200']);
  });

  it('propaga el error si CORS_ORIGIN no está definida (fail-fast, mismo criterio que JWT_SECRET)', () => {
    const configService = {
      getOrThrow: () => {
        throw new TypeError('Configuration key "CORS_ORIGIN" does not exist');
      },
    } as unknown as ConfigService;

    expect(() => parseCorsOrigins(configService)).toThrow('CORS_ORIGIN');
  });
});
