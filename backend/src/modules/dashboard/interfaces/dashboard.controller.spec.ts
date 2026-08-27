import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AccountType, Role } from '@prisma/client';
import { AuthModule } from '../../auth/auth.module';
import { DashboardModule } from '../dashboard.module';
import { USER_REPOSITORY, IUserRepository } from '../../auth/domain/ports/user.repository.port';
import { AuthUser } from '../../auth/domain/entities/auth-user.entity';
import { PasswordHasherService } from '../../auth/application/services/password-hasher.service';
import {
  AccountTypeVolume,
  DASHBOARD_REPOSITORY,
  DashboardKpis,
  IDashboardRepository,
} from '../domain/ports/dashboard.repository.port';

const TEST_ACCESS_SECRET = 'dashboard-integration-access-secret';
const TEST_REFRESH_SECRET = 'dashboard-integration-refresh-secret';
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

// Fake fijo, no en memoria mutable: este archivo prueba guards/roles/forma
// de la respuesta (RN-04, controller "tonto"), no la agregación en sí — eso
// lo prueba prisma-dashboard.repository.spec.ts contra Postgres real.
class FakeDashboardRepository implements IDashboardRepository {
  async getKpis(): Promise<DashboardKpis> {
    return { totalVolumeTransacted: '999.99', failedOrRejectedCount: 7 };
  }
  async getVolumeByAccountType(): Promise<AccountTypeVolume[]> {
    return [{ accountType: AccountType.BASIC, totalVolume: '999.99' }];
  }
}

describe('Dashboard (integración): guards y roles', () => {
  let app: INestApplication;
  let admin: AuthUser;
  let client: AuthUser;

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
      email: 'dashboard-admin@findash.dev',
      documentNumber: '1010000001',
      passwordHash,
      role: Role.ADMIN,
    };
    client = {
      id: 'user-client',
      email: 'dashboard-client@findash.dev',
      documentNumber: '1010000002',
      passwordHash,
      role: Role.CLIENT,
    };

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
        DashboardModule,
      ],
    })
      .overrideProvider(USER_REPOSITORY)
      .useValue(new FakeUserRepository([admin, client]))
      .overrideProvider(DASHBOARD_REPOSITORY)
      .useValue(new FakeDashboardRepository())
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /dashboard/kpis', () => {
    it('permite a un ADMIN ver los KPIs', async () => {
      const token = await loginAndGetToken(admin.email);
      const res = await request(app.getHttpServer())
        .get('/dashboard/kpis')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual({ totalVolumeTransacted: '999.99', failedOrRejectedCount: 7 });
    });

    it('devuelve 403 para un CLIENT autenticado', async () => {
      const token = await loginAndGetToken(client.email);
      await request(app.getHttpServer())
        .get('/dashboard/kpis')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('devuelve 401 sin token', async () => {
      await request(app.getHttpServer()).get('/dashboard/kpis').expect(401);
    });
  });

  describe('GET /dashboard/volume-by-account-type', () => {
    it('permite a un ADMIN ver el volumen por tipo de cuenta', async () => {
      const token = await loginAndGetToken(admin.email);
      const res = await request(app.getHttpServer())
        .get('/dashboard/volume-by-account-type')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual([{ accountType: 'BASIC', totalVolume: '999.99' }]);
    });

    it('devuelve 403 para un CLIENT autenticado', async () => {
      const token = await loginAndGetToken(client.email);
      await request(app.getHttpServer())
        .get('/dashboard/volume-by-account-type')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('devuelve 401 sin token', async () => {
      await request(app.getHttpServer()).get('/dashboard/volume-by-account-type').expect(401);
    });
  });
});
