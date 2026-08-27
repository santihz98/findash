import { AccountType, Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { PrismaTransactionRepository } from './prisma-transaction.repository';

// Integración real contra Postgres — mismo patrón que
// prisma-account.repository.spec.ts. Prefijo propio (TXREPOTEST-), no
// solapado con los demás usados en el proyecto (ver PROGRESS.md Sesión 4).
describe('PrismaTransactionRepository (integración real contra Postgres)', () => {
  let prisma: PrismaClient;
  let repository: PrismaTransactionRepository;

  let userId: string;
  let originAccountId: string;
  let destAccountId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaTransactionRepository(prisma as PrismaService);

    const user = await prisma.user.create({
      data: {
        email: 'txrepotest@findash.dev',
        documentNumber: 'TXREPOTEST-DOC-0001',
        passwordHash: 'irrelevant-for-this-test',
        role: 'CLIENT',
      },
    });
    userId = user.id;

    const origin = await prisma.account.create({
      data: {
        userId: user.id,
        accountNumber: 'TXREPOTEST-ACC-0001',
        balance: '1000.00',
        accountType: AccountType.BASIC,
        status: 'ACTIVE',
      },
    });
    originAccountId = origin.id;

    const dest = await prisma.account.create({
      data: {
        userId: user.id,
        accountNumber: 'TXREPOTEST-ACC-0002',
        balance: '0.00',
        accountType: AccountType.PREMIUM,
        status: 'ACTIVE',
      },
    });
    destAccountId = dest.id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { originAccountId } });
    await prisma.account.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('create() + findById() devuelven la misma Transaction, formateada a 2 decimales', async () => {
    const created = await prisma.$transaction((trx) =>
      repository.create(
        {
          originAccountId,
          destAccountId,
          amount: new Prisma.Decimal('100.00'),
          commission: new Prisma.Decimal('2.00'),
          authorizationCode: 'TXREPOTESTCODE',
          idempotencyKey: 'txrepotest-key-1',
          status: 'COMPLETED',
        },
        trx,
      ),
    );

    const found = await repository.findById(created.id);
    expect(found).toEqual(created);
    expect(found?.amount).toBe('100.00');
    expect(found?.commission).toBe('2.00');
  });

  it('findById() devuelve null para un id que no existe', async () => {
    const found = await repository.findById('00000000-0000-0000-0000-000000000000');
    expect(found).toBeNull();
  });

  // RF-07 (Sesión 6.5): `trx` es opcional — CreateTransferUseCase lo omite
  // para las filas REJECTED/FAILED que ocurren ANTES de runInTransaction
  // (misma cuenta, timeout de anti-fraude). Sin este test, un cambio futuro
  // que rompiera el fallback a `this.prisma` pasaría desapercibido hasta
  // pegarle a esos dos casos específicos en producción.
  it('create() sin `trx` (INSERT suelto) persiste igual, con campos nullable en NULL', async () => {
    const created = await repository.create({
      originAccountId,
      destAccountId: null,
      amount: new Prisma.Decimal('50.00'),
      commission: null,
      authorizationCode: null,
      idempotencyKey: null,
      status: 'FAILED',
    });

    expect(created.destAccountId).toBeNull();
    expect(created.commission).toBeNull();
    expect(created.authorizationCode).toBeNull();

    const found = await repository.findById(created.id);
    expect(found).toEqual(created);

    const row = await prisma.transaction.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.idempotencyKey).toBeNull();
    expect(row.status).toBe('FAILED');
  });
});
