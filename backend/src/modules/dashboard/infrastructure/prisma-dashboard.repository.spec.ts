import { randomUUID } from 'crypto';
import { AccountType, Prisma, PrismaClient, TransactionStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { PrismaDashboardRepository } from './prisma-dashboard.repository';

// RF-07/RF-08 — integración real contra Postgres. Prefijo propio
// (DASHTEST-DOC-/DASHTEST-ACC-), no solapado con los demás usados en el
// proyecto (TESTDOC-/TESTACC-, TXTEST-, CONCTEST-, AFTEST-, IDEMTEST-,
// IDEMWIN-, IDEMAFREL-, TXREPOTEST-, AUDITTEST- — ver PROGRESS.md Sesión 4
// sobre el bug de prefijos compartidos).
//
// Nota de diseño sobre aislamiento — distinta a la de cualquier otro
// archivo de este proyecto: `getKpis()`/`getVolumeByAccountType()` son
// agregaciones GLOBALES a propósito (RF-07/08 piden KPIs "de la
// plataforma", no de una cuenta/usuario en particular) — a diferencia de
// todas las demás queries del proyecto, acá NO hay ningún `WHERE
// originAccountId IN (...)` con el que scopear el resultado a los datos
// propios de este archivo. Con Jest corriendo archivos de test en paralelo
// contra el mismo Postgres (ver el bug de prefijos de la Sesión 4 — ahí el
// problema era un prefijo compartido; acá ni siquiera hay prefijo posible
// porque la query no filtra por nada), un valor absoluto esperado
// (`toBe('600.00')`) sería inherentemente frágil. La solución: medir
// ANTES y DESPUÉS de insertar los datos propios de cada test, y afirmar
// sobre la DIFERENCIA — eso es correcto sin importar qué otra actividad
// (demo, u otro archivo de test) exista en la tabla al mismo tiempo.
describe('PrismaDashboardRepository (integración real contra Postgres)', () => {
  let prisma: PrismaClient;
  let repository: PrismaDashboardRepository;

  const allUserIds: string[] = [];
  const allAccountIds: string[] = [];
  const allTransactionIds: string[] = [];

  let basicAccountId: string;
  let premiumAccountId: string;
  let corpAccountId: string;
  let destAccountId: string;

  async function createTx(data: {
    originAccountId: string;
    destAccountId: string | null;
    amount: string;
    commission: string | null;
    status: TransactionStatus;
  }) {
    const row = await prisma.transaction.create({
      data: {
        originAccountId: data.originAccountId,
        destAccountId: data.destAccountId,
        amount: new Prisma.Decimal(data.amount),
        commission: data.commission ? new Prisma.Decimal(data.commission) : null,
        authorizationCode: data.status === TransactionStatus.COMPLETED ? randomUUID().slice(0, 12).toUpperCase() : null,
        idempotencyKey: data.status === TransactionStatus.COMPLETED ? `dashtest-${randomUUID()}` : null,
        status: data.status,
      },
    });
    allTransactionIds.push(row.id);
    return row;
  }

  function findVolume(rows: { accountType: AccountType; totalVolume: string }[], accountType: AccountType): string {
    return rows.find((r) => r.accountType === accountType)?.totalVolume ?? '0.00';
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaDashboardRepository(prisma as PrismaService);

    async function createUserWithAccount(suffix: string, accountType: AccountType) {
      const user = await prisma.user.create({
        data: {
          email: `dashtest-${suffix}@findash.dev`,
          documentNumber: `DASHTEST-DOC-${suffix}`,
          passwordHash: 'irrelevant-for-this-test',
          role: 'CLIENT',
        },
      });
      allUserIds.push(user.id);
      const account = await prisma.account.create({
        data: {
          userId: user.id,
          accountNumber: `DASHTEST-ACC-${suffix}`,
          balance: '1000.00',
          accountType,
          status: 'ACTIVE',
        },
      });
      allAccountIds.push(account.id);
      return account.id;
    }

    basicAccountId = await createUserWithAccount('0001', AccountType.BASIC);
    premiumAccountId = await createUserWithAccount('0002', AccountType.PREMIUM);
    corpAccountId = await createUserWithAccount('0003', AccountType.CORPORATE);
    destAccountId = await createUserWithAccount('0004', AccountType.PREMIUM);
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { id: { in: allTransactionIds } } });
    await prisma.account.deleteMany({ where: { id: { in: allAccountIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
    await prisma.$disconnect();
  });

  it('sin transacciones propias: la query resuelve con forma válida, nunca lanza (aunque la tabla no esté vacía globalmente)', async () => {
    const kpis = await repository.getKpis();
    expect(kpis.totalVolumeTransacted).toMatch(/^\d+\.\d{2}$/);
    expect(Number.isInteger(kpis.failedOrRejectedCount)).toBe(true);
    expect(kpis.failedOrRejectedCount).toBeGreaterThanOrEqual(0);

    const volume = await repository.getVolumeByAccountType();
    expect(Array.isArray(volume)).toBe(true);
    for (const row of volume) {
      expect(row.totalVolume).toMatch(/^\d+\.\d{2}$/);
    }
  });

  it('mezcla real de COMPLETED/REJECTED/FAILED en los 3 tipos de cuenta: el delta de KPIs y del desglose por tipo coincide exactamente con lo insertado', async () => {
    const kpisBefore = await repository.getKpis();
    const volumeBefore = await repository.getVolumeByAccountType();

    // BASIC: 1 COMPLETED (100.00) + 1 REJECTED (50.00, commission SÍ
    // calculada — mismo caso que InsufficientFundsException, Sesión 6.5).
    await createTx({
      originAccountId: basicAccountId,
      destAccountId,
      amount: '100.00',
      commission: '2.00',
      status: TransactionStatus.COMPLETED,
    });
    await createTx({
      originAccountId: basicAccountId,
      destAccountId,
      amount: '50.00',
      commission: '1.00',
      status: TransactionStatus.REJECTED,
    });

    // PREMIUM: 1 COMPLETED (200.00) + 1 FAILED (30.00, destAccountId/
    // commission NULL — mismo caso que AntiFraudTimeoutException, Sesión
    // 6.5: es EXACTAMENTE el escenario que más probablemente rompería esta
    // query si tocara esas columnas sin cuidado).
    await createTx({
      originAccountId: premiumAccountId,
      destAccountId,
      amount: '200.00',
      commission: '0.00',
      status: TransactionStatus.COMPLETED,
    });
    await createTx({
      originAccountId: premiumAccountId,
      destAccountId: null,
      amount: '30.00',
      commission: null,
      status: TransactionStatus.FAILED,
    });

    // CORPORATE: 1 COMPLETED (300.00), sin fallidas.
    await createTx({
      originAccountId: corpAccountId,
      destAccountId,
      amount: '300.00',
      commission: '5.00',
      status: TransactionStatus.COMPLETED,
    });

    const kpisAfter = await repository.getKpis();
    const volumeAfter = await repository.getVolumeByAccountType();

    // Volumen: solo las 3 COMPLETED cuentan (100 + 200 + 300 = 600) — ni
    // la REJECTED (50) ni la FAILED (30) suman acá (decisión Sesión 7).
    const volumeDelta = new Prisma.Decimal(kpisAfter.totalVolumeTransacted).minus(
      new Prisma.Decimal(kpisBefore.totalVolumeTransacted),
    );
    expect(volumeDelta.toFixed(2)).toBe('600.00');

    // Fallidas/rechazadas: 1 REJECTED + 1 FAILED = 2, sin importar tipo de
    // cuenta (RF-07 las cuenta juntas).
    expect(kpisAfter.failedOrRejectedCount - kpisBefore.failedOrRejectedCount).toBe(2);

    // Desglose por tipo: cada uno sube exactamente por su propia COMPLETED,
    // ninguno por la REJECTED/FAILED del otro tipo.
    const basicDelta = new Prisma.Decimal(findVolume(volumeAfter, AccountType.BASIC)).minus(
      new Prisma.Decimal(findVolume(volumeBefore, AccountType.BASIC)),
    );
    const premiumDelta = new Prisma.Decimal(findVolume(volumeAfter, AccountType.PREMIUM)).minus(
      new Prisma.Decimal(findVolume(volumeBefore, AccountType.PREMIUM)),
    );
    const corpDelta = new Prisma.Decimal(findVolume(volumeAfter, AccountType.CORPORATE)).minus(
      new Prisma.Decimal(findVolume(volumeBefore, AccountType.CORPORATE)),
    );
    expect(basicDelta.toFixed(2)).toBe('100.00');
    expect(premiumDelta.toFixed(2)).toBe('200.00');
    expect(corpDelta.toFixed(2)).toBe('300.00');
  });

  it('una fila REJECTED/FAILED con destAccountId/commission NULL (Sesión 6.5) no rompe ninguna de las dos queries', async () => {
    const kpisBefore = await repository.getKpis();

    // Exactamente el shape que persiste CreateTransferUseCase para
    // AntiFraudTimeoutException/DestinationAccountNotFoundException: NULL
    // en destAccountId, commission, authorizationCode e idempotencyKey.
    await createTx({
      originAccountId: basicAccountId,
      destAccountId: null,
      amount: '77.00',
      commission: null,
      status: TransactionStatus.FAILED,
    });

    // Si cualquiera de las dos queries tocara esas columnas nullable sin
    // cuidado (ej. un JOIN por destAccountId, o leer commission sin
    // COALESCE), esta llamada lanzaría en vez de resolver — no hace falta
    // ningún matcher especial, un `await` que no rechaza ya es la prueba.
    const kpisAfter = await repository.getKpis();
    await repository.getVolumeByAccountType();

    // Sí se contó como fallida...
    expect(kpisAfter.failedOrRejectedCount - kpisBefore.failedOrRejectedCount).toBe(1);
    // ...pero no sumó volumen (no es COMPLETED).
    expect(kpisAfter.totalVolumeTransacted).toBe(kpisBefore.totalVolumeTransacted);
  });
});
