import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AccountStatus, AccountType, Prisma, Role, TransactionStatus } from '@prisma/client';
import { AuthModule } from '../../auth/auth.module';
import { AccountsModule } from '../../accounts/accounts.module';
import { TransactionsModule } from '../transactions.module';
import { USER_REPOSITORY, IUserRepository } from '../../auth/domain/ports/user.repository.port';
import { AuthUser } from '../../auth/domain/entities/auth-user.entity';
import { PasswordHasherService } from '../../auth/application/services/password-hasher.service';
import { ACCOUNT_REPOSITORY, IAccountRepository } from '../../accounts/domain/ports/account.repository.port';
import { Account } from '../../accounts/domain/entities/account.entity';
import {
  CreateTransactionData,
  ITransactionRepository,
  TRANSACTION_REPOSITORY,
} from '../domain/ports/transaction.repository.port';
import { Transaction } from '../domain/entities/transaction.entity';
import {
  IDEMPOTENCY_KEY_REPOSITORY,
  IIdempotencyKeyRepository,
} from '../domain/ports/idempotency-key.repository.port';
import { ANTI_FRAUD_SERVICE, AntiFraudCheckInput, IAntiFraudService } from '../domain/ports/anti-fraud.service.port';
import { DomainExceptionFilter } from '../../../shared/filters/http-exception.filter';

const TEST_ACCESS_SECRET = 'transactions-integration-access-secret';
const TEST_REFRESH_SECRET = 'transactions-integration-refresh-secret';
const DEMO_PASSWORD = 'Demo1234!';

class FakeUserRepository implements IUserRepository {
  constructor(private readonly users: AuthUser[]) {}
  async findByEmail(email: string) {
    return this.users.find((u) => u.email === email) ?? null;
  }
  async findById(id: string) {
    return this.users.find((u) => u.id === id) ?? null;
  }
}

interface FakeAccountRow extends Account {
  userId: string;
}

// Fake que de verdad guarda estado mutable (balances) — así se puede
// verificar después de un transfer que quedaron correctos, sin tocar
// Postgres acá (eso lo hace el test de integración real, más abajo en el
// módulo, contra la DB de verdad).
class FakeAccountRepository implements IAccountRepository {
  constructor(private readonly rows: FakeAccountRow[]) {}

  async findManyWithOwner() {
    return { data: [], total: 0 };
  }

  async findManyByUserId(userId: string): Promise<Account[]> {
    return this.rows
      .filter((r) => r.userId === userId)
      .map(({ userId: _userId, ...rest }) => rest);
  }

  async findById(id: string): Promise<Account | null> {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return null;
    const { userId: _userId, ...rest } = row;
    return rest;
  }

  // RNF-01 (Sesión 5): el use case ahora bloquea con findByIdForUpdate, no
  // findById — el fake no simula el lock en sí (no hay concurrencia real
  // contra un array en memoria), solo necesita devolver el dato correcto
  // para que los tests de guards/roles de este archivo sigan funcionando.
  // El lock de verdad se prueba contra Postgres real en
  // create-transfer-concurrency.integration.spec.ts.
  async findByIdForUpdate(id: string): Promise<Account | null> {
    return this.findById(id);
  }

  async updateBalance(id: string, newBalance: Prisma.Decimal): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row) row.balance = newBalance.toFixed(2);
  }
}

class FakeTransactionRepository implements ITransactionRepository {
  public created: CreateTransactionData[] = [];
  private byId = new Map<string, Transaction>();

  runInTransaction<T>(fn: (trx: unknown) => Promise<T>): Promise<T> {
    return fn('fake-trx');
  }

  async create(data: CreateTransactionData): Promise<Transaction> {
    this.created.push(data);
    const transaction: Transaction = {
      id: `tx-${this.created.length}`,
      originAccountId: data.originAccountId,
      destAccountId: data.destAccountId,
      amount: data.amount.toFixed(2),
      commission: data.commission?.toFixed(2) ?? null,
      authorizationCode: data.authorizationCode,
      status: data.status,
      createdAt: new Date(),
    };
    this.byId.set(transaction.id, transaction);
    return transaction;
  }

  async findById(id: string): Promise<Transaction | null> {
    return this.byId.get(id) ?? null;
  }
}

// RN-01 (Sesión 5): fake en memoria — así este archivo se queda sin tocar
// Postgres, tal como ya estaba desde la Sesión 4 (guards/roles/paginación
// no necesitan una DB real). La idempotencia real, con las garantías de
// UNIQUE de Postgres, se prueba en idempotency.integration.spec.ts.
class FakeIdempotencyKeyRepository implements IIdempotencyKeyRepository {
  private claims = new Map<string, string | null>(); // key -> transactionId | null

  async claim(key: string): Promise<boolean> {
    if (this.claims.has(key)) return false;
    this.claims.set(key, null);
    return true;
  }

  async complete(key: string, transactionId: string): Promise<void> {
    this.claims.set(key, transactionId);
  }

  async findTransactionId(key: string): Promise<string | null> {
    return this.claims.get(key) ?? null;
  }

  async release(key: string): Promise<void> {
    if (this.claims.get(key) === null) {
      this.claims.delete(key);
    }
  }
}

// RN-02 (Sesión 6): sin overridear esto, cada transferencia de este archivo
// pasaría por el SimulatedAntiFraudAdapter real (1-10s aleatorios) — este
// archivo prueba guards/roles/idempotencia, no anti-fraude, así que resuelve
// al toque. El timeout real se prueba aparte.
class InstantAntiFraudService implements IAntiFraudService {
  check(_input: AntiFraudCheckInput): Promise<void> {
    return Promise.resolve();
  }
}

describe('Transactions (integración): guards, roles, y "no desde una cuenta ajena"', () => {
  let app: INestApplication;
  let admin: AuthUser;
  let client1: AuthUser;
  let client2: AuthUser;
  let accountRepo: FakeAccountRepository;
  let txRepo: FakeTransactionRepository;

  const ACCOUNT_CLIENT1 = 'acc-client-1';
  const ACCOUNT_CLIENT2 = 'acc-client-2';

  async function loginAndGetToken(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: DEMO_PASSWORD })
      .expect(200);
    return res.body.accessToken;
  }

  beforeAll(async () => {
    const passwordHasher = new PasswordHasherService();
    const passwordHash = await passwordHasher.hash(DEMO_PASSWORD);

    admin = { id: 'user-admin', email: 'admin@findash.dev', documentNumber: '1', passwordHash, role: Role.ADMIN };
    client1 = {
      id: 'user-client-1',
      email: 'client1@findash.dev',
      documentNumber: '2',
      passwordHash,
      role: Role.CLIENT,
    };
    client2 = {
      id: 'user-client-2',
      email: 'client2@findash.dev',
      documentNumber: '3',
      passwordHash,
      role: Role.CLIENT,
    };

    accountRepo = new FakeAccountRepository([
      {
        id: ACCOUNT_CLIENT1,
        userId: client1.id,
        accountNumber: '1000000001',
        balance: '1000.00',
        accountType: AccountType.BASIC,
        status: AccountStatus.ACTIVE,
        avatarUrl: null,
      },
      {
        id: ACCOUNT_CLIENT2,
        userId: client2.id,
        accountNumber: '1000000002',
        balance: '500.00',
        accountType: AccountType.PREMIUM,
        status: AccountStatus.ACTIVE,
        avatarUrl: null,
      },
    ]);
    txRepo = new FakeTransactionRepository();

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
        AuthModule,
        AccountsModule,
        TransactionsModule,
      ],
    })
      .overrideProvider(USER_REPOSITORY)
      .useValue(new FakeUserRepository([admin, client1, client2]))
      .overrideProvider(ACCOUNT_REPOSITORY)
      .useValue(accountRepo)
      .overrideProvider(TRANSACTION_REPOSITORY)
      .useValue(txRepo)
      .overrideProvider(IDEMPOTENCY_KEY_REPOSITORY)
      .useValue(new FakeIdempotencyKeyRepository())
      .overrideProvider(ANTI_FRAUD_SERVICE)
      .useValue(new InstantAntiFraudService())
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('un CLIENT transfiere desde SU PROPIA cuenta y ambos balances quedan correctos', async () => {
    const token = await loginAndGetToken(client1.email);

    const res = await request(app.getHttpServer())
      .post('/transactions/transfer')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Idempotency-Key', randomUUID())
      .send({ destAccountId: ACCOUNT_CLIENT2, amount: '100' })
      .expect(201);

    expect(res.body).toMatchObject({
      originAccountId: ACCOUNT_CLIENT1,
      destAccountId: ACCOUNT_CLIENT2,
      amount: '100.00',
      commission: '2.00', // BASIC = 2%
      status: TransactionStatus.COMPLETED,
    });

    const origin = await accountRepo.findById(ACCOUNT_CLIENT1);
    const dest = await accountRepo.findById(ACCOUNT_CLIENT2);
    expect(origin?.balance).toBe('898.00'); // 1000 - 100 - 2
    expect(dest?.balance).toBe('600.00'); // 500 + 100
  });

  it('un CLIENT NO puede transferir desde una cuenta que no es suya (originAccountId del body se ignora)', async () => {
    const token = await loginAndGetToken(client1.email);
    const client2AccountBefore = (await accountRepo.findById(ACCOUNT_CLIENT2))!.balance;

    // client1 intenta inyectar en el body la cuenta de client2 como origen,
    // apuntando el destino a su PROPIA cuenta (ACCOUNT_CLIENT1). Si el
    // campo inyectado tuviera efecto, esto sería una transferencia válida
    // de client2 -> client1 sin que client2 haya hecho nada. En cambio, el
    // origen real siempre se resuelve del JWT (client1), así que origen ==
    // destino (ambos ACCOUNT_CLIENT1) y el request rebota 422 — la prueba
    // de que `originAccountId` del body no tuvo ningún efecto.
    await request(app.getHttpServer())
      .post('/transactions/transfer')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Idempotency-Key', randomUUID())
      .send({ originAccountId: ACCOUNT_CLIENT2, destAccountId: ACCOUNT_CLIENT1, amount: '10' })
      .expect(422);

    // La cuenta de client2 no se tocó en absoluto.
    const client2AccountAfter = (await accountRepo.findById(ACCOUNT_CLIENT2))!.balance;
    expect(client2AccountAfter).toBe(client2AccountBefore);
  });

  it('rechaza con 422 si origen y destino terminan siendo la misma cuenta real', async () => {
    const token = await loginAndGetToken(client2.email);

    await request(app.getHttpServer())
      .post('/transactions/transfer')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Idempotency-Key', randomUUID())
      .send({ destAccountId: ACCOUNT_CLIENT2, amount: '10' }) // destino = su propia cuenta
      .expect(422);
  });

  it('rechaza con 404 si la cuenta destino no existe', async () => {
    const token = await loginAndGetToken(client2.email);

    await request(app.getHttpServer())
      .post('/transactions/transfer')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Idempotency-Key', randomUUID())
      .send({ destAccountId: 'no-existe', amount: '10' })
      .expect(404);
  });

  it('rechaza con 422 por fondos insuficientes', async () => {
    const token = await loginAndGetToken(client2.email);

    await request(app.getHttpServer())
      .post('/transactions/transfer')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Idempotency-Key', randomUUID())
      .send({ destAccountId: ACCOUNT_CLIENT1, amount: '999999' })
      .expect(422);
  });

  it.each(['0', '0.00', '-5', '5.999', 'abc', ''])('rechaza amount=%s con 400', async (amount) => {
    const token = await loginAndGetToken(client2.email);

    await request(app.getHttpServer())
      .post('/transactions/transfer')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Idempotency-Key', randomUUID())
      .send({ destAccountId: ACCOUNT_CLIENT1, amount })
      .expect(400);
  });

  it('rechaza con 401 sin token', async () => {
    await request(app.getHttpServer())
      .post('/transactions/transfer')
      .set('X-Idempotency-Key', randomUUID())
      .send({ destAccountId: ACCOUNT_CLIENT1, amount: '10' })
      .expect(401);
  });

  it('rechaza con 403 a un ADMIN (el endpoint es solo-CLIENT)', async () => {
    const token = await loginAndGetToken(admin.email);

    await request(app.getHttpServer())
      .post('/transactions/transfer')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Idempotency-Key', randomUUID())
      .send({ destAccountId: ACCOUNT_CLIENT1, amount: '10' })
      .expect(403);
  });
});
