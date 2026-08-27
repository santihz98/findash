import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AccountStatus, AccountType, Prisma, Role } from '@prisma/client';
import { AuthModule } from '../../auth/auth.module';
import { AccountsModule } from '../accounts.module';
import { USER_REPOSITORY, IUserRepository } from '../../auth/domain/ports/user.repository.port';
import { AuthUser } from '../../auth/domain/entities/auth-user.entity';
import { PasswordHasherService } from '../../auth/application/services/password-hasher.service';
import {
  ACCOUNT_REPOSITORY,
  IAccountRepository,
  ListAccountsFilter,
  ListAccountsResult,
} from '../domain/ports/account.repository.port';
import { Account, AccountWithOwner } from '../domain/entities/account.entity';

const TEST_ACCESS_SECRET = 'accounts-integration-access-secret';
const TEST_REFRESH_SECRET = 'accounts-integration-refresh-secret';
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

interface FakeAccountRow extends AccountWithOwner {
  userId: string;
}

// Fake en memoria que de verdad implementa filtro/paginación (no solo
// devuelve lo que se le diga) — así el test ejercita algo parecido al
// contrato real, dejando la prueba de que el JOIN a Postgres específicamente
// funciona para el test de integración real contra la DB
// (prisma-account.repository.spec.ts).
class FakeAccountRepository implements IAccountRepository {
  constructor(private readonly rows: FakeAccountRow[]) {}

  async findManyWithOwner(filter: ListAccountsFilter): Promise<ListAccountsResult> {
    let filtered = this.rows;
    if (filter.status) {
      filtered = filtered.filter((r) => r.status === filter.status);
    }
    if (filter.documentNumber) {
      filtered = filtered.filter((r) => r.documentNumber.startsWith(filter.documentNumber as string));
    }
    const total = filtered.length;
    const start = (filter.page - 1) * filter.limit;
    const data = filtered.slice(start, start + filter.limit).map(({ userId: _userId, ...rest }) => rest);
    return { data, total };
  }

  async findManyByUserId(userId: string): Promise<Account[]> {
    return this.rows
      .filter((r) => r.userId === userId)
      .map(({ userId: _userId, documentNumber: _doc, email: _email, ...rest }) => rest);
  }

  async findById(id: string): Promise<Account | null> {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return null;
    const { userId: _userId, documentNumber: _doc, email: _email, ...rest } = row;
    return rest;
  }

  async updateBalance(id: string, newBalance: Prisma.Decimal): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row) row.balance = newBalance.toFixed(2);
  }

  findByIdForUpdate(id: string): Promise<Account | null> {
    return this.findById(id);
  }
}

describe('Accounts (integración): guards, roles, paginación, /me', () => {
  let app: INestApplication;
  let admin: AuthUser;
  let client1: AuthUser;
  let client2: AuthUser;

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

    admin = {
      id: 'user-admin',
      email: 'admin@findash.dev',
      documentNumber: '1010000001',
      passwordHash,
      role: Role.ADMIN,
    };
    client1 = {
      id: 'user-client-1',
      email: 'client1@findash.dev',
      documentNumber: '1010000002',
      passwordHash,
      role: Role.CLIENT,
    };
    client2 = {
      id: 'user-client-2',
      email: 'client2@findash.dev',
      documentNumber: '1010000003',
      passwordHash,
      role: Role.CLIENT,
    };

    // 25 cuentas para poder probar paginación con más de una página real.
    const accountRows: FakeAccountRow[] = Array.from({ length: 25 }, (_, i) => ({
      id: `acc-${i + 1}`,
      userId: i % 2 === 0 ? client1.id : client2.id,
      accountNumber: `100000${String(i + 1).padStart(4, '0')}`,
      balance: '1000.00',
      accountType: AccountType.BASIC,
      status: i % 5 === 0 ? AccountStatus.BLOCKED : AccountStatus.ACTIVE,
      avatarUrl: null,
      documentNumber: i % 2 === 0 ? client1.documentNumber : client2.documentNumber,
      email: i % 2 === 0 ? client1.email : client2.email,
    }));

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
      ],
    })
      .overrideProvider(USER_REPOSITORY)
      .useValue(new FakeUserRepository([admin, client1, client2]))
      .overrideProvider(ACCOUNT_REPOSITORY)
      .useValue(new FakeAccountRepository(accountRows))
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /accounts (solo ADMIN)', () => {
    it('permite a un ADMIN listar cuentas con paginación por defecto', async () => {
      const token = await loginAndGetToken(admin.email);

      const res = await request(app.getHttpServer())
        .get('/accounts')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toMatchObject({ page: 1, limit: 20, total: 25, totalPages: 2 });
      expect(res.body.data).toHaveLength(20);
    });

    it('pagina correctamente distintos tamaños de página', async () => {
      const token = await loginAndGetToken(admin.email);

      const page2 = await request(app.getHttpServer())
        .get('/accounts?page=2&limit=10')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(page2.body).toMatchObject({ page: 2, limit: 10, total: 25, totalPages: 3 });
      expect(page2.body.data).toHaveLength(10);

      const page3 = await request(app.getHttpServer())
        .get('/accounts?page=3&limit=10')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(page3.body.data).toHaveLength(5); // resto: 25 - 10 - 10
    });

    it('rechaza page=0 con 400 (no lo recorta en silencio)', async () => {
      const token = await loginAndGetToken(admin.email);
      await request(app.getHttpServer())
        .get('/accounts?page=0')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('rechaza un limit excesivo con 400', async () => {
      const token = await loginAndGetToken(admin.email);
      await request(app.getHttpServer())
        .get('/accounts?limit=999999')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('filtra solo por documentNumber (join a User)', async () => {
      const token = await loginAndGetToken(admin.email);
      const res = await request(app.getHttpServer())
        .get(`/accounts?documentNumber=${client2.documentNumber}&limit=100`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.total).toBe(12); // los índices impares (12 de 25)
      expect(res.body.data.every((a: AccountWithOwner) => a.documentNumber === client2.documentNumber)).toBe(
        true,
      );
    });

    it('filtra solo por status', async () => {
      const token = await loginAndGetToken(admin.email);
      const res = await request(app.getHttpServer())
        .get('/accounts?status=BLOCKED&limit=100')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.every((a: AccountWithOwner) => a.status === 'BLOCKED')).toBe(true);
      expect(res.body.total).toBeGreaterThan(0);
    });

    it('combina documentNumber + status', async () => {
      const token = await loginAndGetToken(admin.email);
      const res = await request(app.getHttpServer())
        .get(`/accounts?documentNumber=${client1.documentNumber}&status=BLOCKED&limit=100`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(
        res.body.data.every(
          (a: AccountWithOwner) => a.documentNumber === client1.documentNumber && a.status === 'BLOCKED',
        ),
      ).toBe(true);
    });

    it('devuelve una página vacía (no un error) cuando no hay coincidencias', async () => {
      const token = await loginAndGetToken(admin.email);
      const res = await request(app.getHttpServer())
        .get('/accounts?documentNumber=9999999999')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toMatchObject({ data: [], total: 0, totalPages: 0 });
    });

    it('nunca expone passwordHash, ni siquiera anidado', async () => {
      const token = await loginAndGetToken(admin.email);
      const res = await request(app.getHttpServer())
        .get('/accounts?limit=100')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('devuelve 401 sin token', async () => {
      await request(app.getHttpServer()).get('/accounts').expect(401);
    });

    it('devuelve 403 para un CLIENT autenticado', async () => {
      const token = await loginAndGetToken(client1.email);
      await request(app.getHttpServer())
        .get('/accounts')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('GET /accounts/me (cualquier rol autenticado)', () => {
    it('devuelve solo las cuentas del usuario autenticado', async () => {
      const token = await loginAndGetToken(client1.email);
      const res = await request(app.getHttpServer())
        .get('/accounts/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      // client1 tiene los índices pares (13 cuentas de 25)
      expect(res.body).toHaveLength(13);
    });

    it('un CLIENT nunca ve las cuentas de otro usuario en /me', async () => {
      const token1 = await loginAndGetToken(client1.email);
      const token2 = await loginAndGetToken(client2.email);

      const res1 = await request(app.getHttpServer())
        .get('/accounts/me')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);
      const res2 = await request(app.getHttpServer())
        .get('/accounts/me')
        .set('Authorization', `Bearer ${token2}`)
        .expect(200);

      const ids1 = res1.body.map((a: Account) => a.id);
      const ids2 = res2.body.map((a: Account) => a.id);
      expect(ids1.some((id: string) => ids2.includes(id))).toBe(false);
    });

    it('funciona para un ADMIN también (cualquier rol autenticado)', async () => {
      const token = await loginAndGetToken(admin.email);
      const res = await request(app.getHttpServer())
        .get('/accounts/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual([]); // el admin de este test no tiene cuentas propias
    });

    it('devuelve 401 sin token', async () => {
      await request(app.getHttpServer()).get('/accounts/me').expect(401);
    });
  });
});
