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

  // RF-02 (Sesión 17): GET /transactions/me. Cuenta propia (destAccountId,
  // creada en beforeAll) usada como "la otra punta" para que el OR
  // origen/destino se ejercite de verdad en ambos sentidos.
  describe('findManyByAccountId (RF-02)', () => {
    it('trae filas donde la cuenta es origen O destino, con direction correcto, paginado, sin traer las de otras cuentas', async () => {
      // origin -> dest: SENT desde el punto de vista de `origin`.
      const sent = await repository.create({
        originAccountId,
        destAccountId,
        amount: new Prisma.Decimal('10.00'),
        commission: new Prisma.Decimal('0.20'),
        authorizationCode: 'TXREPOTEST-SENT01',
        idempotencyKey: 'txrepotest-me-sent-1',
        status: 'COMPLETED',
      });
      // dest -> origin: RECEIVED desde el punto de vista de `origin`.
      const received = await repository.create({
        originAccountId: destAccountId,
        destAccountId: originAccountId,
        amount: new Prisma.Decimal('7.00'),
        commission: new Prisma.Decimal('0.00'),
        authorizationCode: 'TXREPOTEST-RECV01',
        idempotencyKey: 'txrepotest-me-recv-1',
        status: 'COMPLETED',
      });
      // Cuenta de un tercer usuario, no relacionada con `originAccountId` en
      // absoluto — su transacción con `dest` nunca debe aparecerle a `origin`.
      const otherUser = await prisma.user.create({
        data: {
          email: 'txrepotest-other@findash.dev',
          documentNumber: 'TXREPOTEST-DOC-0002',
          passwordHash: 'irrelevant-for-this-test',
          role: 'CLIENT',
        },
      });
      const otherAccount = await prisma.account.create({
        data: {
          userId: otherUser.id,
          accountNumber: 'TXREPOTEST-ACC-0003',
          balance: '0.00',
          accountType: AccountType.BASIC,
          status: 'ACTIVE',
        },
      });
      await repository.create({
        originAccountId: otherAccount.id,
        destAccountId,
        amount: new Prisma.Decimal('999.00'),
        commission: new Prisma.Decimal('0.00'),
        authorizationCode: 'TXREPOTEST-NOISE01',
        idempotencyKey: 'txrepotest-me-noise-1',
        status: 'COMPLETED',
      });

      const result = await repository.findManyByAccountId({ accountId: originAccountId, page: 1, limit: 20 });

      const ids = result.data.map((t) => t.id);
      expect(ids).toEqual(expect.arrayContaining([sent.id, received.id]));
      expect(result.data.every((t) => t.authorizationCode !== 'TXREPOTEST-NOISE01')).toBe(true);

      const sentRow = result.data.find((t) => t.id === sent.id)!;
      const receivedRow = result.data.find((t) => t.id === received.id)!;
      expect(sentRow.direction).toBe('SENT');
      expect(receivedRow.direction).toBe('RECEIVED');

      // Paginación real: page 1 limit 1 y page 2 limit 1 no se solapan.
      const page1 = await repository.findManyByAccountId({ accountId: originAccountId, page: 1, limit: 1 });
      const page2 = await repository.findManyByAccountId({ accountId: originAccountId, page: 2, limit: 1 });
      expect(page1.data).toHaveLength(1);
      expect(page2.data).toHaveLength(1);
      expect(page1.data[0].id).not.toBe(page2.data[0].id);
      expect(page1.total).toBe(page2.total);
      expect(page1.total).toBeGreaterThanOrEqual(2);

      // Limpieza explícita de `received`: su `originAccountId` real es
      // `destAccountId` (la cuenta "dest" del describe raíz), así que el
      // `afterAll` de arriba (que borra por `originAccountId === originAccountId`)
      // no la alcanza — sin este delete, quedaría bloqueando el
      // `account.deleteMany` final por el FK Restrict de Transaction.
      await prisma.transaction.deleteMany({ where: { id: received.id } });
      await prisma.transaction.deleteMany({ where: { originAccountId: otherAccount.id } });
      await prisma.account.deleteMany({ where: { userId: otherUser.id } });
      await prisma.user.deleteMany({ where: { id: otherUser.id } });
    });

    // Sesión 20: `createdAt` NO es `@unique` — dos transferencias con el
    // MISMO timestamp exacto (empate real, forzado acá vía `prisma.
    // transaction.create` directo para controlar `createdAt`, algo que la
    // interfaz del repositorio no expone) no tenían antes ningún criterio
    // de desempate, así que el orden entre ellas no estaba garantizado de
    // una llamada a otra. `id` explícito (fuera de orden a propósito: C,
    // A, B) como segundo criterio de `orderBy` lo resuelve.
    it('orden explícito ante un empate real de createdAt: id ASC como desempate determinístico', async () => {
      const tiedAt = new Date('2020-03-14T00:00:00.000Z');
      const rows = [
        { id: 'txrepotest-order-c', authorizationCode: 'TXREPOTEST-ORDER-C', idempotencyKey: 'txrepotest-order-key-c' },
        { id: 'txrepotest-order-a', authorizationCode: 'TXREPOTEST-ORDER-A', idempotencyKey: 'txrepotest-order-key-a' },
        { id: 'txrepotest-order-b', authorizationCode: 'TXREPOTEST-ORDER-B', idempotencyKey: 'txrepotest-order-key-b' },
      ];
      for (const row of rows) {
        await prisma.transaction.create({
          data: {
            id: row.id,
            originAccountId,
            destAccountId,
            amount: '1.00',
            commission: '0.00',
            authorizationCode: row.authorizationCode,
            idempotencyKey: row.idempotencyKey,
            status: 'COMPLETED',
            createdAt: tiedAt,
          },
        });
      }

      const result = await repository.findManyByAccountId({ accountId: originAccountId, page: 1, limit: 100 });
      const tied = result.data.filter((t) => t.id.startsWith('txrepotest-order-'));

      expect(tied.map((t) => t.id)).toEqual(['txrepotest-order-a', 'txrepotest-order-b', 'txrepotest-order-c']);
    });

    it('devuelve página vacía (data: [], total: 0) para una cuenta sin ninguna transacción', async () => {
      const lonelyUser = await prisma.user.create({
        data: {
          email: 'txrepotest-lonely@findash.dev',
          documentNumber: 'TXREPOTEST-DOC-0003',
          passwordHash: 'irrelevant-for-this-test',
          role: 'CLIENT',
        },
      });
      const lonelyAccount = await prisma.account.create({
        data: {
          userId: lonelyUser.id,
          accountNumber: 'TXREPOTEST-ACC-0004',
          balance: '0.00',
          accountType: AccountType.BASIC,
          status: 'ACTIVE',
        },
      });

      const result = await repository.findManyByAccountId({ accountId: lonelyAccount.id, page: 1, limit: 20 });
      expect(result).toEqual({ data: [], total: 0 });

      await prisma.account.deleteMany({ where: { userId: lonelyUser.id } });
      await prisma.user.deleteMany({ where: { id: lonelyUser.id } });
    });
  });

  // RF-02 (Sesión 17): GET /transactions (solo ADMIN, auditoría) — sin scope
  // de cuenta, filtros combinables por status y rango de fechas. Mismo
  // desafío de aislamiento que documenta prisma-dashboard.repository.spec.ts
  // (Sesión 7): es una query GLOBAL, sin ningún WHERE por el que scopear a
  // datos propios del test — se mide antes/después y se afirma sobre la
  // DIFERENCIA, no sobre un valor absoluto contra una tabla compartida.
  describe('findManyAdmin (RF-02)', () => {
    it('filtra por status y por rango de fechas, combinables, sin importar de qué cuenta sean', async () => {
      const before = await repository.findManyAdmin({ page: 1, limit: 1, status: 'FAILED' });

      const boundary = new Date(Date.now() - 1000);
      const failed = await repository.create({
        originAccountId,
        destAccountId: null,
        amount: new Prisma.Decimal('321.00'),
        commission: null,
        authorizationCode: null,
        idempotencyKey: null,
        status: 'FAILED',
      });

      const after = await repository.findManyAdmin({ page: 1, limit: 1, status: 'FAILED' });
      expect(after.total).toBe(before.total + 1);

      const filteredByDate = await repository.findManyAdmin({
        page: 1,
        limit: 100,
        status: 'FAILED',
        dateFrom: boundary,
      });
      expect(filteredByDate.data.some((t) => t.id === failed.id)).toBe(true);

      const futureDate = await repository.findManyAdmin({
        page: 1,
        limit: 100,
        status: 'FAILED',
        dateFrom: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      expect(futureDate.data.some((t) => t.id === failed.id)).toBe(false);

      const dateTo = await repository.findManyAdmin({
        page: 1,
        limit: 100,
        status: 'FAILED',
        dateTo: new Date(boundary.getTime() - 1),
      });
      expect(dateTo.data.some((t) => t.id === failed.id)).toBe(false);
    });

    it('sin ningún filtro, no lanza y devuelve una forma paginada válida', async () => {
      const result = await repository.findManyAdmin({ page: 1, limit: 5 });
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.total).toBeGreaterThanOrEqual(result.data.length);
    });

    // Sesión 20: mismo desempate que findManyByAccountId, acá contra la
    // query GLOBAL sin scope de cuenta. Se aísla con dateFrom/dateTo
    // exactos sobre un `createdAt` sintético que no colisiona con ningún
    // dato real (2020, muy anterior a cualquier dato de seed/demo/tests).
    it('orden explícito ante un empate real de createdAt: id ASC como desempate determinístico', async () => {
      const tiedAt = new Date('2020-03-15T00:00:00.000Z');
      const rows = [
        {
          id: 'txrepotest-adminorder-c',
          authorizationCode: 'TXREPOTEST-ADMINORDER-C',
          idempotencyKey: 'txrepotest-adminorder-key-c',
        },
        {
          id: 'txrepotest-adminorder-a',
          authorizationCode: 'TXREPOTEST-ADMINORDER-A',
          idempotencyKey: 'txrepotest-adminorder-key-a',
        },
        {
          id: 'txrepotest-adminorder-b',
          authorizationCode: 'TXREPOTEST-ADMINORDER-B',
          idempotencyKey: 'txrepotest-adminorder-key-b',
        },
      ];
      for (const row of rows) {
        await prisma.transaction.create({
          data: {
            id: row.id,
            originAccountId,
            destAccountId,
            amount: '1.00',
            commission: '0.00',
            authorizationCode: row.authorizationCode,
            idempotencyKey: row.idempotencyKey,
            status: 'COMPLETED',
            createdAt: tiedAt,
          },
        });
      }

      const result = await repository.findManyAdmin({
        page: 1,
        limit: 100,
        dateFrom: tiedAt,
        dateTo: tiedAt,
      });

      expect(result.data.map((t) => t.id)).toEqual([
        'txrepotest-adminorder-a',
        'txrepotest-adminorder-b',
        'txrepotest-adminorder-c',
      ]);
    });
  });
});
