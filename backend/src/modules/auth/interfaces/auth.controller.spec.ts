import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Role } from '@prisma/client';
import { AuthModule } from '../auth.module';
import { USER_REPOSITORY, IUserRepository } from '../domain/ports/user.repository.port';
import { AuthUser } from '../domain/entities/auth-user.entity';
import { PasswordHasherService } from '../application/services/password-hasher.service';

const TEST_ACCESS_SECRET = 'integration-test-access-secret';
const TEST_REFRESH_SECRET = 'integration-test-refresh-secret';
const DEMO_PASSWORD = 'Demo1234!';

class FakeUserRepository implements IUserRepository {
  constructor(private readonly users: AuthUser[]) {}

  async findByEmail(email: string): Promise<AuthUser | null> {
    return this.users.find((u) => u.email === email) ?? null;
  }

  async findById(id: string): Promise<AuthUser | null> {
    return this.users.find((u) => u.id === id) ?? null;
  }
}

// Integración real (Nest TestingModule + supertest), no unit test: es la
// única forma de probar de verdad que JwtAuthGuard rechaza token
// ausente/inválido/expirado/de-tipo-incorrecto, ya que el guard en sí es
// solo una subclase vacía de AuthGuard('jwt') — la lógica real vive en la
// integración Passport + JwtStrategy. USER_REPOSITORY se reemplaza por un
// fake en memoria: no toca Postgres.
describe('Auth (integración): login -> JwtAuthGuard -> /me', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let client: AuthUser;

  beforeAll(async () => {
    const passwordHasher = new PasswordHasherService();
    client = {
      id: 'user-client-1',
      email: 'client@findash.dev',
      documentNumber: '1010000002',
      passwordHash: await passwordHasher.hash(DEMO_PASSWORD),
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
      ],
    })
      .overrideProvider(USER_REPOSITORY)
      .useValue(new FakeUserRepository([client]))
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    jwtService = app.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('succeeds with correct credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: client.email, password: DEMO_PASSWORD })
        .expect(200);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.refreshToken).toEqual(expect.any(String));
    });

    it('rejects an unknown email', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nobody@findash.dev', password: DEMO_PASSWORD })
        .expect(401);
    });

    it('rejects an incorrect password', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: client.email, password: 'wrong-password' })
        .expect(401);
    });
  });

  describe('GET /auth/me (JwtAuthGuard)', () => {
    it('returns the profile with a valid access token', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: client.email, password: DEMO_PASSWORD })
        .expect(200);

      const meRes = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
        .expect(200);

      expect(meRes.body).toEqual({
        id: client.id,
        email: client.email,
        documentNumber: client.documentNumber,
        role: client.role,
      });
    });

    it('rejects when there is no Authorization header (token ausente)', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('rejects a malformed/invalid token', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer not-a-real-jwt')
        .expect(401);
    });

    it('rejects an expired access token', async () => {
      const expiredToken = jwtService.sign(
        {
          sub: client.id,
          email: client.email,
          role: client.role,
          type: 'access',
          exp: Math.floor(Date.now() / 1000) - 10,
        },
        { secret: TEST_ACCESS_SECRET },
      );

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });

    it('rejects a refresh token used as an access token', async () => {
      const refreshLikeToken = jwtService.sign(
        { sub: client.id, type: 'refresh' },
        { secret: TEST_ACCESS_SECRET },
      );

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${refreshLikeToken}`)
        .expect(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('issues a new access token from a valid refresh token', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: client.email, password: DEMO_PASSWORD })
        .expect(200);

      const refreshRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: loginRes.body.refreshToken })
        .expect(200);

      expect(refreshRes.body.accessToken).toEqual(expect.any(String));

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${refreshRes.body.accessToken}`)
        .expect(200);
    });

    it('rejects an invalid refresh token', async () => {
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'not-a-real-token' })
        .expect(401);
    });
  });
});
