import { randomUUID } from 'crypto';
import { AccountType, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { PrismaAccountRepository } from '../../../accounts/infrastructure/prisma-account.repository';
import { PrismaTransactionRepository } from '../../infrastructure/prisma-transaction.repository';
import { AuthorizationCodeGeneratorService } from '../services/authorization-code-generator.service';
import { AntiFraudCheckInput, IAntiFraudService } from '../../domain/ports/anti-fraud.service.port';
import { AntiFraudTimeoutException } from '../../domain/exceptions/anti-fraud-timeout.exception';
import { CreateTransferUseCase } from './create-transfer.use-case';

// El anti-fraude "real" (SimulatedAntiFraudAdapter) nunca resuelve antes de
// los 3s (así es como se prueba el timeout de verdad, no una versión
// acelerada) — esta implementación nunca resuelve en absoluto, para que
// SIEMPRE gane el timeout de ANTI_FRAUD_TIMEOUT_MS del use case, sin
// depender de temporizadores falsos de Jest (acá se necesita tiempo real:
// es un test de integración real contra Postgres, sin mocks de por medio
// salvo este, que reemplaza específicamente lo que se está probando).
class NeverRespondingAntiFraudService implements IAntiFraudService {
  check(_input: AntiFraudCheckInput): Promise<void> {
    return new Promise(() => {});
  }
}

// RN-02 + RF-07 (Sesión 6.5) — integración real contra Postgres: la única
// forma honesta de probar que un timeout de anti-fraude no deja NINGÚN
// balance a medias, pero SÍ persiste su fila de auditoría FAILED con los
// campos correctos, es dejar que la transferencia real se aborte de verdad
// y revisar la base después. Prefijo propio (AFTEST-DOC-/AFTEST-ACC-), no
// solapado con los demás usados en el proyecto (ver PROGRESS.md Sesión 4
// sobre el bug de prefijos compartidos).
//
// Nota sobre timing: este archivo SÍ espera ~3s reales (el
// ANTI_FRAUD_TIMEOUT_MS real de producción) — es la excepción deliberada a
// "los tests de anti-fraude corren rápido": acá se está probando
// específicamente que ESE timeout real funciona end-to-end, no solo la
// lógica de negocio (eso ya lo cubren los unit tests con fake timers en
// create-transfer.use-case.spec.ts, que sí son instantáneos).
describe('CreateTransferUseCase — RN-02: timeout de anti-fraude real contra Postgres', () => {
  let prisma: PrismaClient;
  let useCase: CreateTransferUseCase;

  let originUser: { id: string };
  let originAccountId: string;
  let destAccountId: string;
  const allUserIds: string[] = [];
  const allAccountIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const accountRepository = new PrismaAccountRepository(prisma as PrismaService);
    const transactionRepository = new PrismaTransactionRepository(prisma as PrismaService);
    useCase = new CreateTransferUseCase(
      accountRepository,
      transactionRepository,
      new NeverRespondingAntiFraudService(),
      new AuthorizationCodeGeneratorService(),
    );

    originUser = await prisma.user.create({
      data: {
        email: 'aftest-origin@findash.dev',
        documentNumber: 'AFTEST-DOC-0001',
        passwordHash: 'irrelevant-for-this-test',
        role: 'CLIENT',
      },
    });
    allUserIds.push(originUser.id);

    const destUser = await prisma.user.create({
      data: {
        email: 'aftest-dest@findash.dev',
        documentNumber: 'AFTEST-DOC-0002',
        passwordHash: 'irrelevant-for-this-test',
        role: 'CLIENT',
      },
    });
    allUserIds.push(destUser.id);

    const originAccount = await prisma.account.create({
      data: {
        userId: originUser.id,
        accountNumber: 'AFTEST-ACC-0001',
        balance: '1000.00',
        accountType: AccountType.BASIC,
        status: 'ACTIVE',
      },
    });
    originAccountId = originAccount.id;
    allAccountIds.push(originAccount.id);

    const destAccount = await prisma.account.create({
      data: {
        userId: destUser.id,
        accountNumber: 'AFTEST-ACC-0002',
        balance: '500.00',
        accountType: AccountType.PREMIUM,
        status: 'ACTIVE',
      },
    });
    destAccountId = destAccount.id;
    allAccountIds.push(destAccount.id);
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({
      where: { OR: [{ originAccountId: { in: allAccountIds } }, { destAccountId: { in: allAccountIds } }] },
    });
    await prisma.account.deleteMany({ where: { id: { in: allAccountIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
    await prisma.$disconnect();
  });

  it(
    'el timeout de anti-fraude no deja balances a medias, pero SÍ persiste una fila FAILED de auditoría (RF-07, Sesión 6.5)',
    async () => {
      const originBefore = await prisma.account.findUniqueOrThrow({ where: { id: originAccountId } });
      const destBefore = await prisma.account.findUniqueOrThrow({ where: { id: destAccountId } });

      await expect(
        useCase.execute({
          userId: originUser.id,
          destAccountId,
          amount: '50',
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toBeInstanceOf(AntiFraudTimeoutException);

      const originAfter = await prisma.account.findUniqueOrThrow({ where: { id: originAccountId } });
      const destAfter = await prisma.account.findUniqueOrThrow({ where: { id: destAccountId } });

      // Exactamente igual que antes del intento — ni un centavo se movió.
      expect(originAfter.balance.toFixed(2)).toBe(originBefore.balance.toFixed(2));
      expect(destAfter.balance.toFixed(2)).toBe(destBefore.balance.toFixed(2));

      // RF-07 (Sesión 6.5): a diferencia de antes de esta sesión, el abort
      // SÍ persiste una fila de auditoría (real contra Postgres, no solo un
      // mock) — status FAILED, destAccountId/commission/authorizationCode/
      // idempotencyKey todos NULL (el destino nunca se confirmó contra la
      // base en este flujo, y la Strategy tampoco se resolvió).
      const rows = await prisma.transaction.findMany({ where: { originAccountId } });
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('FAILED');
      expect(rows[0].destAccountId).toBeNull();
      expect(rows[0].commission).toBeNull();
      expect(rows[0].authorizationCode).toBeNull();
      expect(rows[0].idempotencyKey).toBeNull();
    },
    8000, // > ANTI_FRAUD_TIMEOUT_MS (3000ms) real + margen para el test runner
  );
});
