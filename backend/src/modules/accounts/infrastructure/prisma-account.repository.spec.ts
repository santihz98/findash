import { AccountStatus, AccountType, Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { PrismaAccountRepository } from './prisma-account.repository';

// Integración real contra Postgres — no mocks. Es la única forma honesta de
// probar que el filtro por documento realmente hace el JOIN Account -> User
// (un fake/mock siempre "funciona" aunque el `where` de Prisma esté mal
// escrito). Usa datos propios, con prefijo TESTDOC-/TESTACC-, para no
// depender ni interferir con los datos de demo del seed — y los borra al
// final.
//
// Requiere DATABASE_URL apuntando a un Postgres real y corriente (ver
// docker-compose.yml / README.md "Desarrollo local"). El step `test` de
// cloudbuild.yaml levanta un Postgres efímero para esto — ver ese archivo.
describe('PrismaAccountRepository (integración real contra Postgres)', () => {
  let prisma: PrismaClient;
  let repository: PrismaAccountRepository;

  let userA: { id: string };
  let userB: { id: string };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaAccountRepository(prisma as PrismaService);

    userA = await prisma.user.create({
      data: {
        email: 'test-repo-a@findash.dev',
        documentNumber: 'TESTDOC-A-0001',
        passwordHash: 'irrelevant-for-this-test',
        role: 'CLIENT',
      },
    });
    userB = await prisma.user.create({
      data: {
        email: 'test-repo-b@findash.dev',
        documentNumber: 'TESTDOC-B-0002',
        passwordHash: 'irrelevant-for-this-test',
        role: 'CLIENT',
      },
    });

    await prisma.account.createMany({
      data: [
        {
          userId: userA.id,
          accountNumber: 'TESTACC-A-0001',
          balance: '1234.56',
          accountType: AccountType.BASIC,
          status: AccountStatus.ACTIVE,
          avatarUrl: null,
        },
        {
          userId: userA.id,
          accountNumber: 'TESTACC-A-0002',
          balance: '500.00',
          accountType: AccountType.PREMIUM,
          status: AccountStatus.ACTIVE,
        },
        {
          userId: userA.id,
          accountNumber: 'TESTACC-A-0003',
          balance: '0.00',
          accountType: AccountType.CORPORATE,
          status: AccountStatus.BLOCKED,
        },
        {
          userId: userB.id,
          accountNumber: 'TESTACC-B-0001',
          balance: '10.00',
          accountType: AccountType.BASIC,
          status: AccountStatus.ACTIVE,
        },
        {
          userId: userB.id,
          accountNumber: 'TESTACC-B-0002',
          balance: '20.00',
          accountType: AccountType.BASIC,
          status: AccountStatus.BLOCKED,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.account.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    await prisma.$disconnect();
  });

  it('el filtro por documentNumber hace el join a User y trae solo esas cuentas', async () => {
    const result = await repository.findManyWithOwner({ page: 1, limit: 100, documentNumber: 'TESTDOC-A' });

    expect(result.total).toBe(3);
    expect(result.data.every((a) => a.documentNumber === 'TESTDOC-A-0001')).toBe(true);
    expect(result.data.map((a) => a.accountNumber).sort()).toEqual([
      'TESTACC-A-0001',
      'TESTACC-A-0002',
      'TESTACC-A-0003',
    ]);
  });

  it('un documentNumber sin coincidencias devuelve página vacía, no un error', async () => {
    const result = await repository.findManyWithOwner({
      page: 1,
      limit: 20,
      documentNumber: 'NOPE-DOES-NOT-EXIST',
    });

    expect(result).toEqual({ data: [], total: 0 });
  });

  it('filtra solo por status, sin documentNumber', async () => {
    const resultB = await repository.findManyWithOwner({
      page: 1,
      limit: 100,
      status: AccountStatus.BLOCKED,
    });

    // Sin filtro de documento, así que puede incluir cuentas BLOCKED de
    // fuera de este test (seed de demo) — lo que importa es que las
    // nuestras SÍ aparezcan y que TODO lo devuelto esté BLOCKED.
    const ours = resultB.data.filter((a) => a.accountNumber.startsWith('TESTACC-'));
    expect(ours.map((a) => a.accountNumber).sort()).toEqual(['TESTACC-A-0003', 'TESTACC-B-0002']);
    expect(resultB.data.every((a) => a.status === AccountStatus.BLOCKED)).toBe(true);
  });

  it('combina documentNumber + status', async () => {
    const result = await repository.findManyWithOwner({
      page: 1,
      limit: 100,
      documentNumber: 'TESTDOC-',
      status: AccountStatus.ACTIVE,
    });

    // 2 ACTIVE de userA + 1 ACTIVE de userB = 3
    expect(result.total).toBe(3);
    expect(result.data.every((a) => a.status === AccountStatus.ACTIVE)).toBe(true);
  });

  it('pagina con skip/take reales (no en memoria)', async () => {
    const page1 = await repository.findManyWithOwner({ page: 1, limit: 2, documentNumber: 'TESTDOC-' });
    const page2 = await repository.findManyWithOwner({ page: 2, limit: 2, documentNumber: 'TESTDOC-' });
    const page3 = await repository.findManyWithOwner({ page: 3, limit: 2, documentNumber: 'TESTDOC-' });

    expect(page1.data).toHaveLength(2);
    expect(page2.data).toHaveLength(2);
    expect(page3.data).toHaveLength(1);
    expect(page1.total).toBe(5);
    expect(page2.total).toBe(5);

    const allIds = [...page1.data, ...page2.data, ...page3.data].map((a) => a.id);
    expect(new Set(allIds).size).toBe(5); // sin duplicados ni huecos entre páginas
  });

  it('serializa balance como string exacto (sin redondeo de punto flotante)', async () => {
    const result = await repository.findManyWithOwner({ page: 1, limit: 100, documentNumber: 'TESTDOC-A' });
    const account = result.data.find((a) => a.accountNumber === 'TESTACC-A-0001');

    expect(account?.balance).toBe('1234.56');
    expect(typeof account?.balance).toBe('string');
  });

  it('conserva los 2 decimales aunque sean ceros (no ".toString()" de decimal.js, que los recorta)', async () => {
    const result = await repository.findManyWithOwner({ page: 1, limit: 100, documentNumber: 'TESTDOC-A' });
    const account = result.data.find((a) => a.accountNumber === 'TESTACC-A-0002'); // creada con balance "500.00"

    expect(account?.balance).toBe('500.00'); // no "500"
  });

  it('devuelve avatarUrl null explícito, no undefined ni string vacío', async () => {
    const result = await repository.findManyWithOwner({ page: 1, limit: 100, documentNumber: 'TESTDOC-A' });
    const account = result.data.find((a) => a.accountNumber === 'TESTACC-A-0001');

    expect(account?.avatarUrl).toBeNull();
  });

  it('findManyByUserId trae solo las cuentas de ese usuario', async () => {
    const accountsA = await repository.findManyByUserId(userA.id);
    const accountsB = await repository.findManyByUserId(userB.id);

    expect(accountsA).toHaveLength(3);
    expect(accountsB).toHaveLength(2);
    expect(accountsA.map((a) => a.accountNumber).sort()).toEqual([
      'TESTACC-A-0001',
      'TESTACC-A-0002',
      'TESTACC-A-0003',
    ]);
  });

  it('findById trae la cuenta por id, sin trx (usada por CreateTransferUseCase, Sesión 4)', async () => {
    const accountsA = await repository.findManyByUserId(userA.id);
    const target = accountsA.find((a) => a.accountNumber === 'TESTACC-A-0001')!;

    const found = await repository.findById(target.id);
    expect(found?.accountNumber).toBe('TESTACC-A-0001');
    expect(found?.balance).toBe('1234.56');
  });

  it('findById devuelve null para un id que no existe', async () => {
    const found = await repository.findById('00000000-0000-0000-0000-000000000000');
    expect(found).toBeNull();
  });

  it('updateBalance persiste el nuevo balance, sin trx', async () => {
    const accountsA = await repository.findManyByUserId(userA.id);
    const target = accountsA.find((a) => a.accountNumber === 'TESTACC-A-0002')!; // balance original "500.00"

    await repository.updateBalance(target.id, new Prisma.Decimal('777.77'));

    const updated = await repository.findById(target.id);
    expect(updated?.balance).toBe('777.77');

    // deja el dato como estaba para no afectar otros tests de este archivo
    await repository.updateBalance(target.id, new Prisma.Decimal('500.00'));
  });

  it('findByIdForUpdate (SELECT ... FOR UPDATE) trae los mismos datos que findById, dentro de una transacción', async () => {
    // Correctness básica acá (¿trae la fila correcta, bien mapeada, sin
    // reventar el SQL crudo?) — la prueba real del LOCK en sí (que bloquea
    // de verdad a una segunda transacción concurrente) está en
    // create-transfer-concurrency.integration.spec.ts, contra un escenario
    // de negocio real, no aislada acá.
    const accountsA = await repository.findManyByUserId(userA.id);
    const target = accountsA.find((a) => a.accountNumber === 'TESTACC-A-0001')!;

    const found = await prisma.$transaction((trx) => repository.findByIdForUpdate(target.id, trx));

    expect(found?.id).toBe(target.id);
    expect(found?.accountNumber).toBe('TESTACC-A-0001');
    expect(found?.balance).toBe('1234.56');
    expect(found?.accountType).toBe(AccountType.BASIC);
    expect(found?.status).toBe(AccountStatus.ACTIVE);
  });

  it('findByIdForUpdate devuelve null para un id que no existe', async () => {
    const found = await prisma.$transaction((trx) =>
      repository.findByIdForUpdate('00000000-0000-0000-0000-000000000000', trx),
    );
    expect(found).toBeNull();
  });
});
