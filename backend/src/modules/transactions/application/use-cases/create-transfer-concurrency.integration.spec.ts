import { randomUUID } from 'crypto';
import { AccountType, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { PrismaAccountRepository } from '../../../accounts/infrastructure/prisma-account.repository';
import { PrismaTransactionRepository } from '../../infrastructure/prisma-transaction.repository';
import { AuthorizationCodeGeneratorService } from '../services/authorization-code-generator.service';
import { CreateTransferUseCase } from './create-transfer.use-case';
import { InsufficientFundsException } from '../../domain/exceptions/insufficient-funds.exception';
import { AntiFraudCheckInput, IAntiFraudService } from '../../domain/ports/anti-fraud.service.port';

// RN-02 (Sesión 6): este archivo prueba RNF-01 (locks), no anti-fraude —
// resuelve al toque para no sumarle 1-10s reales a cada una de las
// transferencias concurrentes de estos tests.
class InstantAntiFraudService implements IAntiFraudService {
  check(_input: AntiFraudCheckInput): Promise<void> {
    return Promise.resolve();
  }
}

// RNF-01 — concurrencia real contra Postgres, sin mocks: la única forma
// honesta de probar locks es contra una base de datos real ejecutando dos
// transacciones de Prisma AL MISMO TIEMPO (Promise.all/allSettled, no
// secuencial) — un mock nunca puede reproducir una condición de carrera de
// verdad. Prefijo propio (CONCTEST-DOC-/CONCTEST-ACC-), no solapado con los
// de accounts/ (TESTDOC-/TESTACC-) ni con el de la Sesión 4
// (TXTEST-DOC-/TXTEST-ACC-) — ver el bug de prefijos solapados documentado
// en PROGRESS.md Sesión 4, que causaba fallas intermitentes corriendo
// suites en paralelo.
describe('CreateTransferUseCase — RNF-01: concurrencia real contra Postgres', () => {
  let prisma: PrismaClient;
  let useCase: CreateTransferUseCase;

  // Escenario 1: mismo origen, dos transferencias concurrentes, fondos
  // suficientes para UNA sola.
  let raceUser: { id: string };
  let raceAccountId: string;
  let raceDestAccountId1: string;
  let raceDestAccountId2: string;

  // Escenario 2: A->B y B->A concurrentes (deadlock cruzado).
  let userA: { id: string };
  let userB: { id: string };
  let accountAId: string;
  let accountBId: string;

  const allUserIds: string[] = [];
  const allAccountIds: string[] = [];

  async function createTestUser(email: string, documentNumber: string) {
    const user = await prisma.user.create({
      data: { email, documentNumber, passwordHash: 'irrelevant-for-this-test', role: 'CLIENT' },
    });
    allUserIds.push(user.id);
    return user;
  }

  async function createTestAccount(params: { userId: string; accountNumber: string; balance: string; accountType: AccountType }) {
    const account = await prisma.account.create({
      data: {
        userId: params.userId,
        accountNumber: params.accountNumber,
        balance: params.balance,
        accountType: params.accountType,
        status: 'ACTIVE',
      },
    });
    allAccountIds.push(account.id);
    return account;
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const accountRepository = new PrismaAccountRepository(prisma as PrismaService);
    const transactionRepository = new PrismaTransactionRepository(prisma as PrismaService);
    useCase = new CreateTransferUseCase(
      accountRepository,
      transactionRepository,
      new InstantAntiFraudService(),
      new AuthorizationCodeGeneratorService(),
    );

    raceUser = await createTestUser('conctest-race@findash.dev', 'CONCTEST-DOC-0001');
    const raceAccount = await createTestAccount({
      userId: raceUser.id,
      accountNumber: 'CONCTEST-ACC-0001',
      balance: '100.00',
      accountType: AccountType.PREMIUM, // 0% comisión -> números redondos y fáciles de verificar
    });
    raceAccountId = raceAccount.id;

    const raceDestUser1 = await createTestUser('conctest-race-dest-1@findash.dev', 'CONCTEST-DOC-0002');
    const raceDestAccount1 = await createTestAccount({
      userId: raceDestUser1.id,
      accountNumber: 'CONCTEST-ACC-0002',
      balance: '0.00',
      accountType: AccountType.BASIC,
    });
    raceDestAccountId1 = raceDestAccount1.id;

    const raceDestUser2 = await createTestUser('conctest-race-dest-2@findash.dev', 'CONCTEST-DOC-0003');
    const raceDestAccount2 = await createTestAccount({
      userId: raceDestUser2.id,
      accountNumber: 'CONCTEST-ACC-0003',
      balance: '0.00',
      accountType: AccountType.BASIC,
    });
    raceDestAccountId2 = raceDestAccount2.id;

    userA = await createTestUser('conctest-cross-a@findash.dev', 'CONCTEST-DOC-0004');
    const accountA = await createTestAccount({
      userId: userA.id,
      accountNumber: 'CONCTEST-ACC-0004',
      balance: '10000.00',
      accountType: AccountType.BASIC,
    });
    accountAId = accountA.id;

    userB = await createTestUser('conctest-cross-b@findash.dev', 'CONCTEST-DOC-0005');
    const accountB = await createTestAccount({
      userId: userB.id,
      accountNumber: 'CONCTEST-ACC-0005',
      balance: '10000.00',
      accountType: AccountType.PREMIUM,
    });
    accountBId = accountB.id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({
      where: { OR: [{ originAccountId: { in: allAccountIds } }, { destAccountId: { in: allAccountIds } }] },
    });
    await prisma.account.deleteMany({ where: { id: { in: allAccountIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
    await prisma.$disconnect();
  });

  describe('dos transferencias concurrentes desde la misma cuenta, fondos para una sola', () => {
    it(
      'el balance final nunca queda negativo y exactamente una de las dos se completa — 5 corridas seguidas',
      async () => {
        for (let attempt = 1; attempt <= 5; attempt++) {
          await prisma.account.update({ where: { id: raceAccountId }, data: { balance: '100.00' } });

          // Promise.allSettled, no secuencial: las dos requests salen al
          // mismo tiempo — es la única forma de ejercitar de verdad la
          // condición de carrera que RNF-01 previene (sin el lock, ambas
          // podrían leer balance=100.00 antes de que cualquiera escriba, y
          // las dos "verían" fondos suficientes -> double-spend).
          const [r1, r2] = await Promise.allSettled([
            useCase.execute({
              userId: raceUser.id,
              destAccountId: raceDestAccountId1,
              amount: '100',
              idempotencyKey: randomUUID(),
            }),
            useCase.execute({
              userId: raceUser.id,
              destAccountId: raceDestAccountId2,
              amount: '100',
              idempotencyKey: randomUUID(),
            }),
          ]);

          const results = [r1, r2];
          const fulfilled = results.filter((r) => r.status === 'fulfilled');
          const rejected = results.filter((r) => r.status === 'rejected');

          expect(fulfilled).toHaveLength(1);
          expect(rejected).toHaveLength(1);
          expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(InsufficientFundsException);

          const finalAccount = await prisma.account.findUniqueOrThrow({ where: { id: raceAccountId } });
          // PREMIUM (0% comisión): 100.00 - 100 (la que ganó) - 0 = 0.00.
          // Si el lock no funcionara, esto podría dar "-100.00" (las dos
          // pasaron) o quedar en "100.00" (ninguna se aplicó bien).
          expect(finalAccount.balance.toFixed(2)).toBe('0.00');
          expect(finalAccount.balance.greaterThanOrEqualTo(0)).toBe(true);
        }
      },
      30000,
    );
  });

  describe('A->B y B->A concurrentes (deadlock cruzado)', () => {
    it(
      'ambas transferencias se completan sin deadlock ni timeout',
      async () => {
        // Sin el orden determinístico de locks, esto es exactamente el
        // patrón clásico de deadlock: A->B bloquea A y espera B; B->A
        // bloquea B y espera A. Postgres detecta el deadlock solo (por
        // default a ~1s) y aborta una de las dos con error — con el orden
        // por id funcionando, ninguna de las dos debería fallar en
        // absoluto, y el test entero debería terminar en milisegundos, muy
        // por debajo del timeout de Jest de acá abajo.
        const [r1, r2] = await Promise.all([
          useCase.execute({
            userId: userA.id,
            destAccountId: accountBId,
            amount: '10',
            idempotencyKey: randomUUID(),
          }),
          useCase.execute({
            userId: userB.id,
            destAccountId: accountAId,
            amount: '10',
            idempotencyKey: randomUUID(),
          }),
        ]);

        expect(r1.status).toBe('COMPLETED');
        expect(r2.status).toBe('COMPLETED');

        const finalA = await prisma.account.findUniqueOrThrow({ where: { id: accountAId } });
        const finalB = await prisma.account.findUniqueOrThrow({ where: { id: accountBId } });
        // A (BASIC, 2%): -10 (a B) -0.20 comisión +10 (de B) = 9999.80
        expect(finalA.balance.toFixed(2)).toBe('9999.80');
        // B (PREMIUM, 0%): -10 (a A) -0 comisión +10 (de A) = 10000.00
        expect(finalB.balance.toFixed(2)).toBe('10000.00');
      },
      8000,
    );
  });
});
