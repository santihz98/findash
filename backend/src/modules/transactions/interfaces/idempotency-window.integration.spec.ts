import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AccountType, PrismaClient } from '@prisma/client';
import { AuthModule } from '../../auth/auth.module';
import { AccountsModule } from '../../accounts/accounts.module';
import { TransactionsModule } from '../transactions.module';
import { PrismaService } from '../../../shared/database/prisma.service';
import { PrismaModule } from '../../../shared/database/prisma.module';
import { PasswordHasherService } from '../../auth/application/services/password-hasher.service';
import { DomainExceptionFilter } from '../../../shared/filters/http-exception.filter';
import {
  ANTI_FRAUD_SERVICE,
  ANTI_FRAUD_TIMEOUT_MS,
  AntiFraudCheckInput,
  IAntiFraudService,
} from '../domain/ports/anti-fraud.service.port';

const TEST_ACCESS_SECRET = 'idem-window-access-secret';
const TEST_REFRESH_SECRET = 'idem-window-refresh-secret';
const DEMO_PASSWORD = 'Demo1234!';

// Deliberadamente cerca del límite de ANTI_FRAUD_TIMEOUT_MS (3000ms) pero
// sin llegar — así la request ORIGINAL sí termina con éxito, pero tarda
// casi todo el presupuesto del anti-fraude antes de llegar siquiera a la
// parte transaccional. Es exactamente el escenario que motivó ajustar
// MAX_WAIT_MS del interceptor (RN-02, Sesión 6): con la ventana vieja
// (3000ms, igual al timeout del anti-fraude) esta request casi no tendría
// margen para el resto del pipeline, y la request que espera podría cortar
// con 409 de forma prematura aunque la original fuera a terminar bien un
// instante después.
const NEAR_LIMIT_DELAY_MS = ANTI_FRAUD_TIMEOUT_MS - 50;

class SlowButUnderTimeoutAntiFraudService implements IAntiFraudService {
  check(_input: AntiFraudCheckInput): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, NEAR_LIMIT_DELAY_MS));
  }
}

// RN-01 + RN-02 — integración real contra Postgres y HTTP real
// (`supertest`): la única forma honesta de probar que la ventana de espera
// del interceptor (ahora 5000ms, ver PROGRESS.md Sesión 6) efectivamente
// cubre el peor caso end-to-end es dejar que una request tarde de verdad
// cerca del límite y ver qué le pasa a una segunda request concurrente con
// la misma key. Nota de timing: este archivo espera ~2.8s reales a
// propósito (NEAR_LIMIT_DELAY_MS) — mismo criterio que
// create-transfer-antifraud.integration.spec.ts: acá se prueba el timing
// real, no solo la lógica (eso ya lo cubren los unit tests con fake
// timers).
describe('RN-01 + RN-02: la ventana de idempotencia cubre una request que tarda cerca del límite de anti-fraude', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  let originAccountId: string;
  let destAccountId: string;
  const allUserIds: string[] = [];
  const allAccountIds: string[] = [];
  let accessToken: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const passwordHasher = new PasswordHasherService();
    const passwordHash = await passwordHasher.hash(DEMO_PASSWORD);

    const originUser = await prisma.user.create({
      data: {
        email: 'idem-window-origin@findash.dev',
        documentNumber: 'IDEMWIN-DOC-0001',
        passwordHash,
        role: 'CLIENT',
      },
    });
    allUserIds.push(originUser.id);

    const destUser = await prisma.user.create({
      data: {
        email: 'idem-window-dest@findash.dev',
        documentNumber: 'IDEMWIN-DOC-0002',
        passwordHash,
        role: 'CLIENT',
      },
    });
    allUserIds.push(destUser.id);

    const originAccount = await prisma.account.create({
      data: {
        userId: originUser.id,
        accountNumber: 'IDEMWIN-ACC-0001',
        balance: '1000.00',
        accountType: AccountType.PREMIUM,
        status: 'ACTIVE',
      },
    });
    originAccountId = originAccount.id;
    allAccountIds.push(originAccount.id);

    const destAccount = await prisma.account.create({
      data: {
        userId: destUser.id,
        accountNumber: 'IDEMWIN-ACC-0002',
        balance: '0.00',
        accountType: AccountType.BASIC,
        status: 'ACTIVE',
      },
    });
    destAccountId = destAccount.id;
    allAccountIds.push(destAccount.id);

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_SECRET: TEST_ACCESS_SECRET,
              JWT_REFRESH_SECRET: TEST_REFRESH_SECRET,
              JWT_ACCESS_EXPIRES_IN: '15m',
              JWT_REFRESH_EXPIRES_IN: '7d',
            }),
          ],
        }),
        PrismaModule,
        AuthModule,
        AccountsModule,
        TransactionsModule,
      ],
    })
      .overrideProvider(ANTI_FRAUD_SERVICE)
      .useValue(new SlowButUnderTimeoutAntiFraudService())
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'idem-window-origin@findash.dev', password: DEMO_PASSWORD })
      .expect(200);
    accessToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
    await prisma.transaction.deleteMany({
      where: { OR: [{ originAccountId: { in: allAccountIds } }, { destAccountId: { in: allAccountIds } }] },
    });
    await prisma.idempotencyKey.deleteMany({ where: { key: { startsWith: 'idem-window-' } } });
    await prisma.account.deleteMany({ where: { id: { in: allAccountIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
    await prisma.$disconnect();
  });

  it(
    'la segunda request con la misma key recibe la respuesta cacheada, no un 409 prematuro',
    async () => {
      const key = `idem-window-${randomUUID()}`;
      const originBefore = await prisma.account.findUniqueOrThrow({ where: { id: originAccountId } });

      // Promise.all, no secuencial: la segunda arranca casi al mismo
      // tiempo que la primera, mientras la primera todavía está esperando
      // la respuesta (lenta) del anti-fraude — exactamente el escenario
      // real que la ventana ajustada tiene que cubrir.
      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post('/transactions/transfer')
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Idempotency-Key', key)
          .send({ destAccountId, amount: '10' }),
        request(app.getHttpServer())
          .post('/transactions/transfer')
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Idempotency-Key', key)
          .send({ destAccountId, amount: '10' }),
      ]);

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201); // nunca 409 — ahí es donde fallaría con la ventana vieja
      expect(res1.body).toEqual(res2.body);

      const txCount = await prisma.transaction.count({ where: { idempotencyKey: key } });
      expect(txCount).toBe(1); // el use case corrió una sola vez

      // PREMIUM (0% comisión): si se hubiera ejecutado dos veces, la
      // diferencia sería 20.00, no 10.00.
      const originAfter = await prisma.account.findUniqueOrThrow({ where: { id: originAccountId } });
      expect(originBefore.balance.minus(originAfter.balance).toFixed(2)).toBe('10.00');
    },
    10000, // NEAR_LIMIT_DELAY_MS (~2.8s) real + margen generoso para el test runner
  );
});
