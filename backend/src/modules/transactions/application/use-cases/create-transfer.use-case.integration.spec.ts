import { randomUUID } from 'crypto';
import { AccountType, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { PrismaAccountRepository } from '../../../accounts/infrastructure/prisma-account.repository';
import { PrismaTransactionRepository } from '../../infrastructure/prisma-transaction.repository';
import { AuthorizationCodeGeneratorService } from '../services/authorization-code-generator.service';
import { AntiFraudCheckInput, IAntiFraudService } from '../../domain/ports/anti-fraud.service.port';
import { CreateTransferUseCase } from './create-transfer.use-case';

// RN-02 (Sesión 6): este archivo no prueba anti-fraude, así que resuelve al
// toque — el timeout/delay real se prueba aparte (ver
// create-transfer-antifraud.integration.spec.ts). Sin esto, cada
// transferencia acá esperaría 1-10s reales de la implementación real.
class InstantAntiFraudService implements IAntiFraudService {
  check(_input: AntiFraudCheckInput): Promise<void> {
    return Promise.resolve();
  }
}

// Integración real contra Postgres, sin mocks — mismo patrón que
// prisma-account.repository.spec.ts (Sesión 3): la única forma honesta de
// probar que una transferencia real dentro de una transacción de Prisma dos
// UPDATE + un INSERT) deja AMBOS balances exactamente correctos en la base,
// con el formato fijo a 2 decimales ("898.00", no "898"). Usa datos propios
// (prefijo TXTEST-DOC-/TXTEST-ACC- — deliberadamente NO "TESTDOC-"/"TESTACC-"
// como en accounts/: esos tests filtran por `startsWith('TESTDOC-')` y, como
// Jest corre los archivos de test en paralelo contra el mismo Postgres, un
// prefijo compartido entre suites hace que se cuenten entre sí — ya pasó y
// se corrigió, ver PROGRESS.md Sesión 4), borrados en afterAll.
describe('CreateTransferUseCase (integración real contra Postgres)', () => {
  let prisma: PrismaClient;
  let useCase: CreateTransferUseCase;

  let basicUser: { id: string };
  let corpUser: { id: string };
  let destUser: { id: string };
  let basicAccountId: string;
  let corpAccountId: string;
  let destAccountId: string;

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

    basicUser = await prisma.user.create({
      data: {
        email: 'test-transfer-basic@findash.dev',
        documentNumber: 'TXTEST-DOC-0001',
        passwordHash: 'irrelevant-for-this-test',
        role: 'CLIENT',
      },
    });
    corpUser = await prisma.user.create({
      data: {
        email: 'test-transfer-corp@findash.dev',
        documentNumber: 'TXTEST-DOC-0002',
        passwordHash: 'irrelevant-for-this-test',
        role: 'CLIENT',
      },
    });
    destUser = await prisma.user.create({
      data: {
        email: 'test-transfer-dest@findash.dev',
        documentNumber: 'TXTEST-DOC-0003',
        passwordHash: 'irrelevant-for-this-test',
        role: 'CLIENT',
      },
    });

    const basicAccount = await prisma.account.create({
      data: {
        userId: basicUser.id,
        accountNumber: 'TXTEST-ACC-0001',
        balance: '1000.00',
        accountType: AccountType.BASIC,
        status: 'ACTIVE',
      },
    });
    const corpAccount = await prisma.account.create({
      data: {
        userId: corpUser.id,
        accountNumber: 'TXTEST-ACC-0002',
        balance: '100000.00',
        accountType: AccountType.CORPORATE,
        status: 'ACTIVE',
      },
    });
    const destAccount = await prisma.account.create({
      data: {
        userId: destUser.id,
        accountNumber: 'TXTEST-ACC-0003',
        balance: '500.00',
        accountType: AccountType.PREMIUM,
        status: 'ACTIVE',
      },
    });

    basicAccountId = basicAccount.id;
    corpAccountId = corpAccount.id;
    destAccountId = destAccount.id;
  });

  afterAll(async () => {
    const userIds = [basicUser.id, corpUser.id, destUser.id];
    const accountIds = [basicAccountId, corpAccountId, destAccountId];
    await prisma.transaction.deleteMany({
      where: { OR: [{ originAccountId: { in: accountIds } }, { destAccountId: { in: accountIds } }] },
    });
    await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('transferencia real BASIC: descuenta $102.00 del origen y acredita $100.00 al destino', async () => {
    const result = await useCase.execute({
      userId: basicUser.id,
      destAccountId,
      amount: '100',
      idempotencyKey: randomUUID(),
    });

    expect(result.amount).toBe('100.00');
    expect(result.commission).toBe('2.00');
    expect(result.status).toBe('COMPLETED');
    expect(result.authorizationCode).toMatch(/^[0-9A-F]{12}$/);

    const originRow = await prisma.account.findUniqueOrThrow({ where: { id: basicAccountId } });
    const destRow = await prisma.account.findUniqueOrThrow({ where: { id: destAccountId } });

    expect(originRow.balance.toFixed(2)).toBe('898.00'); // 1000.00 - 100 - 2
    expect(destRow.balance.toFixed(2)).toBe('600.00'); // 500.00 + 100

    const txRow = await prisma.transaction.findUniqueOrThrow({ where: { id: result.id } });
    expect(txRow.amount.toFixed(2)).toBe('100.00');
    expect(txRow.commission?.toFixed(2)).toBe('2.00'); // COMPLETED siempre tiene commission (Sesión 6.5: null solo en REJECTED/FAILED)
    expect(txRow.idempotencyKey).toBeTruthy();
    expect(txRow.originAccountId).toBe(basicAccountId);
    expect(txRow.destAccountId).toBe(destAccountId);
  });

  it('transferencia real CORPORATE: $5.00 fijo con $10 y con $10,000 (no escala)', async () => {
    const destBefore = await prisma.account.findUniqueOrThrow({ where: { id: destAccountId } });

    const small = await useCase.execute({
      userId: corpUser.id,
      destAccountId,
      amount: '10',
      idempotencyKey: randomUUID(),
    });
    expect(small.commission).toBe('5.00');

    const afterSmall = await prisma.account.findUniqueOrThrow({ where: { id: corpAccountId } });
    // 100000.00 - 10 - 5 = 99985.00
    expect(afterSmall.balance.toFixed(2)).toBe('99985.00');

    const large = await useCase.execute({
      userId: corpUser.id,
      destAccountId,
      amount: '10000',
      idempotencyKey: randomUUID(),
    });
    expect(large.commission).toBe('5.00'); // el fijo no escala

    const afterLarge = await prisma.account.findUniqueOrThrow({ where: { id: corpAccountId } });
    // 99985.00 - 10000 - 5 = 89980.00
    expect(afterLarge.balance.toFixed(2)).toBe('89980.00');

    const destAfter = await prisma.account.findUniqueOrThrow({ where: { id: destAccountId } });
    // destino recibió 10 + 10000 = 10010, sin comisión (la paga el origen)
    expect(destAfter.balance.minus(destBefore.balance).toFixed(2)).toBe('10010.00');
  });
});
