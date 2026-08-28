import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { parseCorsOrigins } from './cors.config';

// Controller mínimo, sin Postgres ni ningún módulo de negocio de por medio
// — este archivo prueba exclusivamente el comportamiento de CORS a nivel
// HTTP (app.enableCors, configurado en main.ts vía parseCorsOrigins), no
// nada de auth/accounts/transactions.
@Controller()
class PingController {
  @Get('ping')
  ping() {
    return { ok: true };
  }
}

@Module({ controllers: [PingController] })
class PingModule {}

const ALLOWED_ORIGIN = 'http://localhost:4200';

describe('CORS (app.enableCors + CORS_ORIGIN): integración HTTP real', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ CORS_ORIGIN: ALLOWED_ORIGIN })],
        }),
        PingModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mismo wiring que main.ts: origin viene de parseCorsOrigins, no de un
    // array hardcodeado en el test.
    app.enableCors({ origin: parseCorsOrigins(app.get(ConfigService)) });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('permite (Access-Control-Allow-Origin) un origen listado en CORS_ORIGIN', async () => {
    const res = await request(app.getHttpServer()).get('/ping').set('Origin', ALLOWED_ORIGIN);

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
  });

  it('rechaza (sin Access-Control-Allow-Origin) un GET desde un origen NO listado en CORS_ORIGIN', async () => {
    const res = await request(app.getHttpServer()).get('/ping').set('Origin', 'http://evil.example.com');

    // El servidor igual responde (CORS se aplica del lado del browser, no
    // como un 4xx del servidor) — lo que prueba el rechazo es la AUSENCIA
    // del header que le permitiría al browser leer la respuesta.
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rechaza (sin Access-Control-Allow-Origin) un preflight OPTIONS desde un origen NO listado', async () => {
    const res = await request(app.getHttpServer())
      .options('/ping')
      .set('Origin', 'http://evil.example.com')
      .set('Access-Control-Request-Method', 'GET');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
