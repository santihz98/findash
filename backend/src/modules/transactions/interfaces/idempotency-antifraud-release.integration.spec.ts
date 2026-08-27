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

const TEST_ACCESS_SECRET = 'idem-af-release-access-secret';
const TEST_REFRESH_SECRET = 'idem-af-release-refresh-secret';
const DEMO_PASSWORD = 'Demo1234!';

// Anti-fraude que nunca responde -> SIEMPRE gana el timeout real de
// ANTI_FRAUD_TIMEOUT_MS del use case (3s) — deliberado, es lo que se está
// probando: que IdempotencyInterceptor libera la key ante ESTA excepción
// específica (AntiFraudTimeoutException), no solo ante las que ya se
// probaron en la Sesión 5 (fondos insuficientes, etc.) — "no lo des por
// sentado" (tarea 4), así que se verifica con un test real y separado.
class NeverRespondingAntiFraudService implements IAntiFraudService {
  check(_input: AntiFraudCheckInput): Promise<void> {
    return new Promise(() => {});
  }
}

describe('RN-01 + RN-02: IdempotencyInterceptor libera la key ante un timeout de anti-fraude', () => {
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
        email: 'idem-af-release-origin@findash.dev',
        documentNumber: 'IDEMAFREL-DOC-0001',
        passwordHash,
        role: 'CLIENT',
      },
    });
    allUserIds.push(originUser.id);

    const destUser = await prisma.user.create({
      data: {
        email: 'idem-af-release-dest@findash.dev',
        documentNumber: 'IDEMAFREL-DOC-0002',
        passwordHash,
        role: 'CLIENT',
      },
    });
    allUserIds.push(destUser.id);

    const originAccount = await prisma.account.create({
      data: {
        userId: originUser.id,
        accountNumber: 'IDEMAFREL-ACC-0001',
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
        accountNumber: 'IDEMAFREL-ACC-0002',
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
      .useValue(new NeverRespondingAntiFraudService())
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'idem-af-release-origin@findash.dev', password: DEMO_PASSWORD })
      .expect(200);
    accessToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
    await prisma.transaction.deleteMany({
      where: { OR: [{ originAccountId: { in: allAccountIds } }, { destAccountId: { in: allAccountIds } }] },
    });
    await prisma.idempotencyKey.deleteMany({ where: { key: { startsWith: 'idem-af-release-' } } });
    await prisma.account.deleteMany({ where: { id: { in: allAccountIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
    await prisma.$disconnect();
  });

  it(
    'un timeout de anti-fraude (504) libera la key — no queda reclamada para siempre',
    async () => {
      const key = `idem-af-release-${randomUUID()}`;
      const originBefore = await prisma.account.findUniqueOrThrow({ where: { id: originAccountId } });

      await request(app.getHttpServer())
        .post('/transactions/transfer')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Idempotency-Key', key)
        .send({ destAccountId, amount: '10' })
        .expect(504);

      // Mismo criterio de "nada a medias" que
      // create-transfer-antifraud.integration.spec.ts, esta vez vía HTTP.
      const originAfter = await prisma.account.findUniqueOrThrow({ where: { id: originAccountId } });
      expect(originAfter.balance.toFixed(2)).toBe(originBefore.balance.toFixed(2));

      // Prueba directa de que el interceptor SÍ liberó la key: si no la
      // hubiera liberado, la fila seguiría existiendo con transactionId
      // NULL. `release()` hace un DELETE ... WHERE transaction_id IS NULL
      // (ver PrismaIdempotencyKeyRepository) — así que si funcionó, la fila
      // ya no existe en absoluto.
      const record = await prisma.idempotencyKey.findUnique({ where: { key } });
      expect(record).toBeNull();

      // Ninguna Transaction quedó ligada a ESTA key — RF-07 (Sesión 6.5)
      // sí persiste una fila FAILED de auditoría para el timeout (ver
      // create-transfer-antifraud.integration.spec.ts), pero con
      // idempotencyKey siempre NULL, nunca la key real del header. Esto es
      // lo que efectivamente resuelve el conflicto de UNIQUE con un retry
      // futuro: si esta fila hubiera guardado `key` tal cual, un retry
      // exitoso con la MISMA key después violaría el `@unique` de la
      // columna al intentar crear la fila COMPLETED.
      const txCount = await prisma.transaction.count({ where: { idempotencyKey: key } });
      expect(txCount).toBe(0);

      // Y sí existe la fila de auditoría esperada, scopeada por cuenta
      // origen (no por key, ya que la key nunca se persiste acá).
      const auditRows = await prisma.transaction.findMany({ where: { originAccountId } });
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0].status).toBe('FAILED');
      expect(auditRows[0].idempotencyKey).toBeNull();
    },
    8000, // > ANTI_FRAUD_TIMEOUT_MS (3000ms) real + margen
  );
});
