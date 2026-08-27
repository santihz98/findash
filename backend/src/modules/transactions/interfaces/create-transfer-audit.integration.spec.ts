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

// RF-07 (Sesión 6.5): este archivo no prueba anti-fraude, así que resuelve
// al toque — el timeout real (y su propia fila FAILED de auditoría) ya se
// prueba en create-transfer-antifraud.integration.spec.ts.
class InstantAntiFraudService implements IAntiFraudService {
  check(_input: AntiFraudCheckInput): Promise<void> {
    return Promise.resolve();
  }
}

const TEST_ACCESS_SECRET = 'audit-integration-access-secret';
const TEST_REFRESH_SECRET = 'audit-integration-refresh-secret';
const DEMO_PASSWORD = 'Demo1234!';

// RF-07 (Sesión 6.5) — integración real contra Postgres, vía HTTP
// (supertest): la clasificación de excepciones en REJECTED/FAILED/no-
// persistible (ver CreateTransferUseCase y PROGRESS.md Sesión 6.5) solo
// significa algo si se verifica contra la base real, no un mock — un mock
// no puede probar que el UNIQUE constraint de idempotency_key sigue
// intacto (tarea 9), ni que el FK de destAccountId realmente exige NULL en
// vez de un id inventado. Prefijo propio (AUDITTEST-DOC-/AUDITTEST-ACC-),
// no solapado con los demás usados en el proyecto (ver PROGRESS.md Sesión
// 4 sobre el bug de prefijos compartidos).
describe('RF-07 (Sesión 6.5): auditoría de transferencias REJECTED/FAILED — integración real', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  let insufficientFundsAccountId: string;
  let sameAccountId: string;
  let uniqueConflictAccountId: string;
  let noOriginDestAccountId: string;
  let destAccountId: string;
  const allUserIds: string[] = [];
  const allAccountIds: string[] = [];

  let insufficientFundsToken: string;
  let sameAccountToken: string;
  let uniqueConflictToken: string;
  let noOriginUserToken: string;

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: DEMO_PASSWORD })
      .expect(200);
    return res.body.accessToken;
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const passwordHasher = new PasswordHasherService();
    const passwordHash = await passwordHasher.hash(DEMO_PASSWORD);

    async function createUserWithAccount(
      emailSuffix: string,
      docSuffix: string,
      accSuffix: string,
      balance: string,
      accountType: AccountType = AccountType.BASIC,
    ) {
      const user = await prisma.user.create({
        data: {
          email: `audittest-${emailSuffix}@findash.dev`,
          documentNumber: `AUDITTEST-DOC-${docSuffix}`,
          passwordHash,
          role: 'CLIENT',
        },
      });
      allUserIds.push(user.id);
      const account = await prisma.account.create({
        data: {
          userId: user.id,
          accountNumber: `AUDITTEST-ACC-${accSuffix}`,
          balance,
          accountType,
          status: 'ACTIVE',
        },
      });
      allAccountIds.push(account.id);
      return { userId: user.id, accountId: account.id };
    }

    const insufficientFunds = await createUserWithAccount('insuf', '0001', '0001', '10.00');
    insufficientFundsAccountId = insufficientFunds.accountId;

    const sameAccount = await createUserWithAccount('same', '0002', '0002', '1000.00');
    sameAccountId = sameAccount.accountId;

    const uniqueConflict = await createUserWithAccount('uniqconf', '0003', '0003', '5.00', AccountType.PREMIUM);
    uniqueConflictAccountId = uniqueConflict.accountId;

    // Usuario para NoOriginAccountException: deliberadamente SIN cuenta —
    // el punto de este caso es que no hay ninguna cuenta origen real
    // (tarea 11).
    const noOriginUser = await prisma.user.create({
      data: {
        email: 'audittest-noorigin@findash.dev',
        documentNumber: 'AUDITTEST-DOC-0004',
        passwordHash,
        role: 'CLIENT',
      },
    });
    allUserIds.push(noOriginUser.id);

    const dest = await createUserWithAccount('dest', '0005', '0004', '500.00', AccountType.PREMIUM);
    destAccountId = dest.accountId;

    // Dest exclusivo del test de NoOriginAccountException, para poder
    // scopear el conteo de Transaction sin depender de actividad de otros
    // tests de este mismo archivo.
    const noOriginDest = await createUserWithAccount('noorigindest', '0006', '0005', '0.00', AccountType.PREMIUM);
    noOriginDestAccountId = noOriginDest.accountId;

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
      .useValue(new InstantAntiFraudService())
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();

    insufficientFundsToken = await login('audittest-insuf@findash.dev');
    sameAccountToken = await login('audittest-same@findash.dev');
    uniqueConflictToken = await login('audittest-uniqconf@findash.dev');
    noOriginUserToken = await login('audittest-noorigin@findash.dev');
  });

  afterAll(async () => {
    await app.close();
    await prisma.transaction.deleteMany({
      where: { OR: [{ originAccountId: { in: allAccountIds } }, { destAccountId: { in: allAccountIds } }] },
    });
    await prisma.idempotencyKey.deleteMany({ where: { key: { startsWith: 'audittest-' } } });
    await prisma.account.deleteMany({ where: { id: { in: allAccountIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
    await prisma.$disconnect();
  });

  it('InsufficientFundsException (422): persiste REJECTED con commission calculada, balances sin cambios (tareas 8 y 10)', async () => {
    const originBefore = await prisma.account.findUniqueOrThrow({ where: { id: insufficientFundsAccountId } });
    const destBefore = await prisma.account.findUniqueOrThrow({ where: { id: destAccountId } });

    // BASIC (2% comisión): $10 de saldo no alcanza para transferir $100
    // (102 total con comisión).
    await request(app.getHttpServer())
      .post('/transactions/transfer')
      .set('Authorization', `Bearer ${insufficientFundsToken}`)
      .set('X-Idempotency-Key', `audittest-insuf-${randomUUID()}`)
      .send({ destAccountId, amount: '100' })
      .expect(422);

    const originAfter = await prisma.account.findUniqueOrThrow({ where: { id: insufficientFundsAccountId } });
    const destAfter = await prisma.account.findUniqueOrThrow({ where: { id: destAccountId } });
    expect(originAfter.balance.toFixed(2)).toBe(originBefore.balance.toFixed(2));
    expect(destAfter.balance.toFixed(2)).toBe(destBefore.balance.toFixed(2));

    const rows = await prisma.transaction.findMany({ where: { originAccountId: insufficientFundsAccountId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('REJECTED');
    expect(rows[0].destAccountId).toBe(destAccountId); // el destino SÍ se confirmó real antes de validar fondos
    expect(rows[0].commission?.toFixed(2)).toBe('2.00'); // ya se había calculado
    expect(rows[0].authorizationCode).toBeNull();
    expect(rows[0].idempotencyKey).toBeNull();
  });

  it('DestinationAccountNotFoundException (404): persiste REJECTED con destAccountId/commission NULL, balance origen sin cambios (tareas 8 y 10)', async () => {
    const originBefore = await prisma.account.findUniqueOrThrow({ where: { id: sameAccountId } });

    await request(app.getHttpServer())
      .post('/transactions/transfer')
      .set('Authorization', `Bearer ${sameAccountToken}`)
      .set('X-Idempotency-Key', `audittest-404-${randomUUID()}`)
      .send({ destAccountId: '00000000-0000-0000-0000-000000000000', amount: '5' })
      .expect(404);

    const originAfter = await prisma.account.findUniqueOrThrow({ where: { id: sameAccountId } });
    expect(originAfter.balance.toFixed(2)).toBe(originBefore.balance.toFixed(2));

    const rows = await prisma.transaction.findMany({ where: { originAccountId: sameAccountId, status: 'REJECTED' } });
    expect(rows).toHaveLength(1);
    expect(rows[0].destAccountId).toBeNull(); // nunca el id inexistente crudo — el FK lo rechazaría
    expect(rows[0].commission).toBeNull();
    expect(rows[0].authorizationCode).toBeNull();
    expect(rows[0].idempotencyKey).toBeNull();
  });

  it('SameAccountTransferException (422): persiste REJECTED con destAccountId = origen, balance sin cambios (tareas 8 y 10)', async () => {
    const originBefore = await prisma.account.findUniqueOrThrow({ where: { id: sameAccountId } });

    await request(app.getHttpServer())
      .post('/transactions/transfer')
      .set('Authorization', `Bearer ${sameAccountToken}`)
      .set('X-Idempotency-Key', `audittest-same-${randomUUID()}`)
      .send({ destAccountId: sameAccountId, amount: '5' })
      .expect(422);

    const originAfter = await prisma.account.findUniqueOrThrow({ where: { id: sameAccountId } });
    expect(originAfter.balance.toFixed(2)).toBe(originBefore.balance.toFixed(2));

    const rows = await prisma.transaction.findMany({
      where: { originAccountId: sameAccountId, status: 'REJECTED', destAccountId: sameAccountId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].commission).toBeNull();
    expect(rows[0].authorizationCode).toBeNull();
    expect(rows[0].idempotencyKey).toBeNull();
  });

  it('NoOriginAccountException (422): NO persiste ninguna fila (tarea 11) — sin cambios de comportamiento', async () => {
    const before = await prisma.transaction.count({ where: { destAccountId: noOriginDestAccountId } });
    expect(before).toBe(0);

    await request(app.getHttpServer())
      .post('/transactions/transfer')
      .set('Authorization', `Bearer ${noOriginUserToken}`)
      .set('X-Idempotency-Key', `audittest-noorigin-${randomUUID()}`)
      .send({ destAccountId: noOriginDestAccountId, amount: '5' })
      .expect(422);

    const after = await prisma.transaction.count({ where: { destAccountId: noOriginDestAccountId } });
    expect(after).toBe(0); // ni antes ni después — no hay cuenta origen real a la cual atar una fila
  });

  it('conflicto de UNIQUE resuelto (tarea 9): REJECTED con idempotencyKey NULL no bloquea un retry COMPLETED con la MISMA key', async () => {
    const key = `audittest-uniqconf-${randomUUID()}`;

    // Fondos insuficientes a propósito: $5.00 de saldo, PREMIUM (0%
    // comisión) no alcanza para transferir $50.
    await request(app.getHttpServer())
      .post('/transactions/transfer')
      .set('Authorization', `Bearer ${uniqueConflictToken}`)
      .set('X-Idempotency-Key', key)
      .send({ destAccountId, amount: '50' })
      .expect(422);

    const rejectedRow = await prisma.transaction.findFirstOrThrow({
      where: { originAccountId: uniqueConflictAccountId, status: 'REJECTED' },
    });
    expect(rejectedRow.idempotencyKey).toBeNull();

    // Se corrigen los fondos (mismo criterio que "recargar saldo" del
    // comentario de release() en IIdempotencyKeyRepository) y se reintenta
    // con la MISMA key — el interceptor ya la liberó porque el use case
    // lanzó (Sesión 5).
    await prisma.account.update({ where: { id: uniqueConflictAccountId }, data: { balance: '1000.00' } });

    const completedRes = await request(app.getHttpServer())
      .post('/transactions/transfer')
      .set('Authorization', `Bearer ${uniqueConflictToken}`)
      .set('X-Idempotency-Key', key)
      .send({ destAccountId, amount: '50' })
      .expect(201);

    expect(completedRes.body.status).toBe('COMPLETED');

    // La fila COMPLETED sí guarda la key real — sin ningún constraint
    // violation, porque la fila REJECTED de arriba nunca ocupó ese valor
    // en la columna @unique.
    const completedRow = await prisma.transaction.findUniqueOrThrow({ where: { id: completedRes.body.id } });
    expect(completedRow.idempotencyKey).toBe(key);
    expect(completedRow.status).toBe('COMPLETED');

    const allRowsForKey = await prisma.transaction.findMany({ where: { idempotencyKey: key } });
    expect(allRowsForKey).toHaveLength(1); // solo la COMPLETED — la REJECTED nunca tuvo esta key
  });
});
