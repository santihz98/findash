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
import { ANTI_FRAUD_SERVICE, AntiFraudCheckInput, IAntiFraudService } from '../domain/ports/anti-fraud.service.port';

// RN-02 (Sesión 6): el resto del stack de este archivo es real a propósito
// (ver el comentario en Test.createTestingModule), pero el anti-fraude real
// (SimulatedAntiFraudAdapter) demora 1-10s aleatorios por llamada — con 4
// tests que hacen varias transferencias cada uno, este archivo tardaría
// minutos reales sin este override. Este archivo prueba RN-01, no RN-02.
class InstantAntiFraudService implements IAntiFraudService {
  check(_input: AntiFraudCheckInput): Promise<void> {
    return Promise.resolve();
  }
}

const TEST_ACCESS_SECRET = 'idempotency-integration-access-secret';
const TEST_REFRESH_SECRET = 'idempotency-integration-refresh-secret';
const DEMO_PASSWORD = 'Demo1234!';

// RN-01 — integración real, sin overrides de ningún provider: la única
// forma honesta de probar que el UNIQUE constraint de Postgres (no un
// fake en memoria) es lo que de verdad serializa dos requests concurrentes
// con la misma X-Idempotency-Key. Prefijo propio (IDEMTEST-DOC-/
// IDEMTEST-ACC-), no solapado con TESTDOC-/TXTEST-DOC-/CONCTEST-DOC- (ver
// el bug de prefijos de la Sesión 4 en PROGRESS.md).
describe('Idempotencia (RN-01): integración real contra Postgres, vía HTTP', () => {
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
        email: 'idemtest-origin@findash.dev',
        documentNumber: 'IDEMTEST-DOC-0001',
        passwordHash,
        role: 'CLIENT',
      },
    });
    allUserIds.push(originUser.id);

    const destUser = await prisma.user.create({
      data: {
        email: 'idemtest-dest@findash.dev',
        documentNumber: 'IDEMTEST-DOC-0002',
        passwordHash,
        role: 'CLIENT',
      },
    });
    allUserIds.push(destUser.id);

    const originAccount = await prisma.account.create({
      data: {
        userId: originUser.id,
        accountNumber: 'IDEMTEST-ACC-0001',
        balance: '1000.00',
        accountType: AccountType.PREMIUM, // 0% comisión -> matemática simple
        status: 'ACTIVE',
      },
    });
    originAccountId = originAccount.id;
    allAccountIds.push(originAccount.id);

    const destAccount = await prisma.account.create({
      data: {
        userId: destUser.id,
        accountNumber: 'IDEMTEST-ACC-0002',
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
      // Sin overrides de los repos: PrismaUserRepository/
      // PrismaAccountRepository/PrismaTransactionRepository/
      // PrismaIdempotencyKeyRepository reales, los cuatro contra el mismo
      // Postgres. ANTI_FRAUD_SERVICE sí se overridea (ver arriba) — no es
      // parte de lo que este archivo prueba.
    })
      .overrideProvider(ANTI_FRAUD_SERVICE)
      .useValue(new InstantAntiFraudService())
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'idemtest-origin@findash.dev', password: DEMO_PASSWORD })
      .expect(200);
    accessToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
    await prisma.transaction.deleteMany({
      where: { OR: [{ originAccountId: { in: allAccountIds } }, { destAccountId: { in: allAccountIds } }] },
    });
    await prisma.idempotencyKey.deleteMany({ where: { key: { startsWith: 'idemtest-' } } });
    await prisma.account.deleteMany({ where: { id: { in: allAccountIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
    await prisma.$disconnect();
  });

  it('rechaza con 400 si falta el header X-Idempotency-Key', async () => {
    await request(app.getHttpServer())
      .post('/transactions/transfer')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ destAccountId, amount: '10' })
      .expect(400);
  });

  it('la misma X-Idempotency-Key reenviada (secuencial) devuelve la MISMA transacción — no duplica la fila', async () => {
    const key = `idemtest-sequential-${randomUUID()}`;
    const balanceBefore = (await prisma.account.findUniqueOrThrow({ where: { id: originAccountId } })).balance;

    const res1 = await request(app.getHttpServer())
      .post('/transactions/transfer')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Idempotency-Key', key)
      .send({ destAccountId, amount: '50' })
      .expect(201);

    const res2 = await request(app.getHttpServer())
      .post('/transactions/transfer')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Idempotency-Key', key)
      .send({ destAccountId, amount: '50' })
      .expect(201);

    expect(res2.body).toEqual(res1.body);

    const rows = await prisma.transaction.findMany({ where: { idempotencyKey: key } });
    expect(rows).toHaveLength(1);

    const balanceAfter = (await prisma.account.findUniqueOrThrow({ where: { id: originAccountId } })).balance;
    // Si se hubiera ejecutado dos veces, la diferencia sería 100.00, no 50.00.
    expect(balanceBefore.minus(balanceAfter).toFixed(2)).toBe('50.00');
  });

  it('carrera exacta (Promise.all, misma key): solo una ejecuta el use case, ambas respuestas quedan idénticas', async () => {
    const key = `idemtest-race-${randomUUID()}`;
    const balanceBefore = (await prisma.account.findUniqueOrThrow({ where: { id: originAccountId } })).balance;

    // Promise.all, no secuencial: las dos requests salen al mismo tiempo.
    // Con el UNIQUE constraint + el poll acotado del interceptor, la
    // segunda espera a que la primera termine y devuelve su misma
    // Transaction — nunca corre el use case dos veces. Documentado también
    // en PROGRESS.md: si la primera tardara más de MAX_WAIT_MS (3s), la
    // segunda cortaría con 409 en vez de esperar para siempre.
    const [res1, res2] = await Promise.all([
      request(app.getHttpServer())
        .post('/transactions/transfer')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Idempotency-Key', key)
        .send({ destAccountId, amount: '25' }),
      request(app.getHttpServer())
        .post('/transactions/transfer')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Idempotency-Key', key)
        .send({ destAccountId, amount: '25' }),
    ]);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res1.body).toEqual(res2.body);

    const rows = await prisma.transaction.findMany({ where: { idempotencyKey: key } });
    expect(rows).toHaveLength(1);

    const balanceAfter = (await prisma.account.findUniqueOrThrow({ where: { id: originAccountId } })).balance;
    expect(balanceBefore.minus(balanceAfter).toFixed(2)).toBe('25.00');
  }, 10000);

  it('libera la key si el use case falla, para que un retry legítimo funcione', async () => {
    const key = `idemtest-retry-after-failure-${randomUUID()}`;

    // Primer intento: destino inexistente -> falla (404), nunca llega a
    // crear una Transaction.
    await request(app.getHttpServer())
      .post('/transactions/transfer')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Idempotency-Key', key)
      .send({ destAccountId: '00000000-0000-0000-0000-000000000000', amount: '5' })
      .expect(404);

    // Retry con la MISMA key, ahora con un destino válido -> si la key se
    // hubiera quedado "reclamada para siempre", esto colgaría hasta el
    // timeout del interceptor (3s) y cortaría con 409. Como se liberó,
    // entra de nuevo y se ejecuta normal.
    const res = await request(app.getHttpServer())
      .post('/transactions/transfer')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Idempotency-Key', key)
      .send({ destAccountId, amount: '5' })
      .expect(201);

    expect(res.body.amount).toBe('5.00');

    const rows = await prisma.transaction.findMany({ where: { idempotencyKey: key } });
    expect(rows).toHaveLength(1);

    // RF-07 (Sesión 6.5): el primer intento fallido SÍ dejó una fila
    // REJECTED de auditoría (destino inexistente), pero con idempotencyKey
    // NULL — nunca la key real. Si hubiera guardado `key` tal cual, el
    // INSERT de la fila COMPLETED de arriba habría violado el `@unique` de
    // esa columna en vez de completar con 201. Ver el test dedicado a este
    // conflicto, con InsufficientFundsException en vez de 404, en
    // create-transfer-audit.integration.spec.ts (tarea 9, PROGRESS.md
    // Sesión 6.5).
    const rejectedRows = await prisma.transaction.findMany({
      where: { originAccountId, status: 'REJECTED', idempotencyKey: null },
    });
    expect(rejectedRows.length).toBeGreaterThanOrEqual(1);
  });
});
