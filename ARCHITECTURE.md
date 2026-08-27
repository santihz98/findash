# FinDash - Billetera Digital
## Documento de Arquitectura Técnica

> Este documento es la fuente de verdad arquitectónica del proyecto. Debe vivir en la raíz del repositorio (`ARCHITECTURE.md`) y ser el primer contexto que se le dé a Claude Code al iniciar cada sesión de desarrollo.

---

## 1. Resumen ejecutivo

El reto no es "hacer que funcione", es demostrar que el sistema **puede absorber cambios de negocio sin reescritura**. Esto se traduce en tres decisiones estructurales:

1. **Arquitectura Hexagonal (Ports & Adapters) en el backend** — el dominio (reglas de negocio) no conoce ni a Express/Nest, ni a Postgres, ni a HTTP. Todo se conecta por interfaces (puertos).
2. **Strategy Pattern para comisiones (RN-03)** — agregar un nuevo nivel de cuenta = una clase nueva, cero modificaciones a código existente (Open/Closed Principle).
3. **Use Cases explícitos (RN-04)** — los controladores son "tontos": reciben el request, llaman a un Use Case, devuelven la respuesta. Toda la orquestación vive en la capa de aplicación.

---

## 2. Stack tecnológico y justificación

| Capa | Tecnología | Por qué |
|---|---|---|
| Backend | Node.js + TypeScript + **NestJS** | DI nativa, decoradores, Guards (RBAC), Interceptors (idempotencia), Pipes (validación). Reduce el "boilerplate SOLID" bajo presión de tiempo. |
| Base de datos | **PostgreSQL** | ACID real, soporta `SELECT ... FOR UPDATE` y aislamiento serializable — obligatorio para RNF-01 (race conditions). |
| ORM | Prisma (o TypeORM) | Migraciones versionadas + transacciones explícitas. |
| Frontend | Angular (standalone components) | Requisito del documento. |
| Estado global | **NgRx** | Cumple RNF-03: ningún componente presentacional inyecta `HttpClient`. |
| Auth | JWT (access + refresh) | RF-01. |
| Cloud | **AWS**: ECS Fargate + RDS + Secrets Manager + Firebase Hosting (desde la Sesión 8 — diseño original en GCP, ver sección 7 y su Anexo; App Runner intentado primero, bloqueado por restricción de producto de AWS, pivot a ECS Fargate en la Sesión 9) | Containerizado, HTTPS gestionado en RDS/Secrets Manager, CI/CD simple con GitHub Actions vía OIDC. |
| Testing | Jest (backend) + Jasmine/Jest (frontend) | Cobertura > 80% exigida. |

---

## 3. Arquitectura Backend — Hexagonal / Clean Architecture

```
backend/
├── src/
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── domain/                # Entidades, value objects, puertos (interfaces)
│   │   │   ├── application/           # Use cases (LoginUseCase, RefreshTokenUseCase)
│   │   │   ├── infrastructure/        # JwtService, PassportStrategy
│   │   │   └── interfaces/            # AuthController, DTOs, Guards
│   │   │
│   │   ├── accounts/
│   │   │   ├── domain/
│   │   │   │   ├── entities/account.entity.ts
│   │   │   │   └── ports/account.repository.port.ts
│   │   │   ├── application/
│   │   │   │   └── use-cases/list-accounts.use-case.ts   # paginación + filtros (RF-03)
│   │   │   ├── infrastructure/
│   │   │   │   └── prisma-account.repository.ts          # implementa el puerto
│   │   │   └── interfaces/
│   │   │       └── accounts.controller.ts
│   │   │
│   │   ├── transactions/               # ← módulo núcleo del negocio
│   │   │   ├── domain/
│   │   │   │   ├── entities/transaction.entity.ts
│   │   │   │   ├── strategies/                            # RN-03
│   │   │   │   │   ├── commission-strategy.interface.ts
│   │   │   │   │   ├── basic-commission.strategy.ts        # 2%
│   │   │   │   │   ├── premium-commission.strategy.ts      # 0%
│   │   │   │   │   └── corporate-commission.strategy.ts    # $5 fijo
│   │   │   │   ├── factories/
│   │   │   │   │   └── commission-strategy.factory.ts
│   │   │   │   └── ports/
│   │   │   │       ├── transaction.repository.port.ts
│   │   │   │       └── anti-fraud.service.port.ts          # RN-02
│   │   │   ├── application/
│   │   │   │   ├── use-cases/
│   │   │   │   │   └── create-transfer.use-case.ts          # RN-04: orquestador
│   │   │   │   └── services/
│   │   │   │       ├── funds-validator.service.ts
│   │   │   │       ├── authorization-code-generator.service.ts
│   │   │   │       └── idempotency-checker.service.ts       # RN-01
│   │   │   ├── infrastructure/
│   │   │   │   ├── prisma-transaction.repository.ts
│   │   │   │   └── simulated-anti-fraud.adapter.ts          # RN-02: race con timeout
│   │   │   └── interfaces/
│   │   │       ├── transactions.controller.ts
│   │   │       ├── dto/create-transfer.dto.ts
│   │   │       └── interceptors/idempotency.interceptor.ts
│   │   │
│   │   └── dashboard/
│   │       ├── application/use-cases/get-kpis.use-case.ts   # RF-07
│   │       ├── infrastructure/                              # queries agregadas, cacheables
│   │       └── interfaces/dashboard.controller.ts
│   │
│   ├── shared/
│   │   ├── guards/roles.guard.ts                            # RF-02 RBAC
│   │   ├── decorators/roles.decorator.ts
│   │   └── filters/http-exception.filter.ts
│   └── main.ts
├── prisma/schema.prisma
└── test/
```

**Regla de dependencia:** `interfaces` → `application` → `domain`. `infrastructure` implementa los puertos definidos en `domain`. El dominio **nunca** importa nada de Nest, Prisma o Express.

### 3.1. RN-03 — Strategy + Factory (comisiones)

```typescript
// domain/strategies/commission-strategy.interface.ts
interface ICommissionStrategy {
  calculate(amount: number): number;
}

// domain/strategies/corporate-commission.strategy.ts
class CorporateCommissionStrategy implements ICommissionStrategy {
  calculate(amount: number): number { return 5; } // fijo, sin importar el monto
}

// domain/factories/commission-strategy.factory.ts
class CommissionStrategyFactory {
  static create(accountType: AccountType): ICommissionStrategy {
    switch (accountType) {
      case AccountType.BASIC: return new BasicCommissionStrategy();
      case AccountType.PREMIUM: return new PremiumCommissionStrategy();
      case AccountType.CORPORATE: return new CorporateCommissionStrategy();
    }
  }
}
```

**Este es el punto que más va a valorar el evaluador**: cuando Producto lance "Cuenta VIP" mañana, se agrega `VipCommissionStrategy` + un `case` en el factory. Cero cambios en `CreateTransferUseCase`. Esto es literalmente el Open/Closed Principle demostrado con código, no solo mencionado.

### 3.2. RN-04 — Use Case como orquestador puro

```typescript
// application/use-cases/create-transfer.use-case.ts
class CreateTransferUseCase {
  constructor(
    private readonly accountRepo: IAccountRepository,
    private readonly txRepo: ITransactionRepository,
    private readonly antiFraud: IAntiFraudService,
    private readonly fundsValidator: FundsValidatorService,
    private readonly authCodeGenerator: AuthorizationCodeGeneratorService,
  ) {}

  async execute(command: CreateTransferCommand): Promise<Transaction> {
    // 1. idempotencia ya resuelta por el interceptor antes de llegar aquí
    // 2. anti-fraude con timeout (RN-02)
    await this.antiFraud.check(command); // aborta si tarda > 3s

    // 3. transacción DB con locks (RNF-01)
    return this.txRepo.runInTransaction(async (trx) => {
      const origin = await this.accountRepo.lockForUpdate(command.originId, trx);
      const dest = await this.accountRepo.lockForUpdate(command.destId, trx);

      this.fundsValidator.assertSufficientFunds(origin, command.amount);

      const strategy = CommissionStrategyFactory.create(origin.type);
      const commission = strategy.calculate(command.amount);

      const authCode = this.authCodeGenerator.generate();

      origin.debit(command.amount + commission);
      dest.credit(command.amount);

      await this.accountRepo.save(origin, trx);
      await this.accountRepo.save(dest, trx);
      return this.txRepo.create({ ...command, commission, authCode }, trx);
    });
  }
}
```

El controlador solo hace: `dto → command → useCase.execute() → response`. **Cero lógica de negocio en el controller.**

### 3.3. RN-02 — Timeout ante servicio anti-fraude

```typescript
// infrastructure/simulated-anti-fraud.adapter.ts
class SimulatedAntiFraudAdapter implements IAntiFraudService {
  async check(command: CreateTransferCommand): Promise<void> {
    const externalCall = this.simulateExternalService(); // 1-10s aleatorio
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new AntiFraudTimeoutException()), 3000)
    );
    await Promise.race([externalCall, timeout]); // aborta limpio a los 3s
  }
}
```

### 3.4. RN-01 — Idempotencia (defensa en profundidad)

- **Interceptor HTTP** (`IdempotencyInterceptor`): antes de invocar el Use Case, busca `X-Idempotency-Key` en tabla `idempotency_keys`. Si existe, devuelve la respuesta cacheada (misma transacción original) sin re-ejecutar nada.
- **Constraint único en DB** (`UNIQUE(idempotency_key)`) como red de seguridad si dos requests llegan en paralelo exacto — el segundo falla el `INSERT` y el interceptor lo traduce a "devolver el original" en vez de un error 500.

### 3.5. RNF-01 — Concurrencia sin condiciones de carrera

- Transacción de Postgres con `SELECT ... FOR UPDATE` sobre ambas cuentas (origen y destino).
- **Orden determinístico de bloqueo** (siempre por `id` ascendente) para evitar deadlocks cuando dos transferencias cruzadas ocurren simultáneamente.
- Aislamiento `READ COMMITTED` + locks explícitos (más performante que `SERIALIZABLE` para este caso de uso, y suficiente porque el lock ya serializa el acceso a las filas críticas).

---

## 4. Arquitectura Frontend — Angular + NgRx

```
frontend/
├── src/app/
│   ├── core/
│   │   ├── guards/role.guard.ts             # RF-02
│   │   ├── interceptors/
│   │   │   ├── jwt.interceptor.ts
│   │   │   └── idempotency-key.interceptor.ts   # genera UUID por request de transferencia
│   │   └── services/                        # únicos lugares con HttpClient
│   │
│   ├── state/                               # NgRx global
│   │   ├── accounts/  (actions, reducer, effects, selectors)
│   │   ├── transactions/
│   │   └── dashboard/
│   │
│   ├── features/
│   │   ├── accounts/
│   │   │   ├── containers/account-list.page.ts       # "smart" — conecta al Store
│   │   │   └── components/
│   │   │       ├── account-avatar.component.ts        # RF-04: placeholder + skeleton
│   │   │       └── account-table.component.ts         # "dumb" — solo @Input/@Output
│   │   │
│   │   ├── transfer/
│   │   │   └── containers/transfer-form.page.ts
│   │   │
│   │   └── dashboard/                        # lazy-loaded (RNF-04)
│   │       ├── containers/dashboard.page.ts
│   │       └── components/kpi-cards.component.ts, volume-chart.component.ts
│   │
│   ├── shared/
│   │   ├── directives/image-fallback.directive.ts   # RF-04: intercepta error de <img>
│   │   └── components/skeleton-loader.component.ts
│   │
│   └── app.routes.ts                          # dashboard con loadComponent/@defer
```

**Patrón Smart/Dumb (Container/Presentational):**
- Los *containers* (`*.page.ts`) son los únicos que hacen `store.select()` / `store.dispatch()`.
- Los componentes presentacionales solo reciben `@Input()` y emiten `@Output()` — **jamás** inyectan `HttpClient` ni el `Store` directamente. Esto es literalmente lo que pide RNF-03.

**RF-04 (avatares e imágenes rotas):**
```typescript
@Directive({ selector: 'img[appImageFallback]' })
export class ImageFallbackDirective {
  @HostListener('error') onError() {
    this.el.nativeElement.src = 'assets/avatar-placeholder.svg';
  }
}
```
Combinado con un `SkeletonLoaderComponent` que se muestra mientras `loading$` del store es `true`.

**RNF-04 (aislar el Dashboard):**
- Ruta `dashboard` cargada con `loadComponent` (standalone lazy) — no entra en el bundle inicial.
- Los gráficos (`volume-chart.component.ts`, vía Chart.js o ngx-charts) se cargan con `@defer (on viewport)` para no penalizar ni siquiera la navegación inicial al dashboard.

---

## 5. Seguridad y RBAC (RF-01, RF-02)

- JWT con claim `role: 'ADMIN' | 'CLIENT'`.
- Backend: `@Roles('ADMIN')` + `RolesGuard` en los endpoints de métricas/auditoría.
- Frontend: `RoleGuard` en las rutas de `/dashboard` y `/admin/*`, más una directiva estructural `*appHasRole="'ADMIN'"` para ocultar elementos de UI (defensa en profundidad — el backend es la autoridad real, el frontend es UX).

---

## 6. Testing (> 80% cobertura)

| Qué testear | Cómo |
|---|---|
| Strategies de comisión | Unit tests puros, sin mocks — input → output esperado por cada tipo de cuenta |
| `CreateTransferUseCase` | Mockear los puertos (`IAccountRepository`, `IAntiFraudService`) — probar orquestación, fondos insuficientes, timeout de anti-fraude, idempotencia |
| Race conditions | Test de integración con dos llamadas concurrentes reales contra Postgres (test container) verificando que el saldo nunca queda negativo |
| Guards/RBAC | Unit test simulando `ExecutionContext` con distintos roles |
| Angular: reducers/selectors | Puros, fáciles de cubrir al 100% |
| Angular: effects | Marble testing (`jasmine-marbles` o `rxjs testing`) |
| Componentes presentacionales | Testing Library / Jest — verificar que renderizan según `@Input`, sin lógica de negocio que testear |

Configura `jest.config.js` con `coverageThreshold: { global: { branches: 80, functions: 80, lines: 80 } }` para que el CI falle si baja del umbral — es evidencia objetiva para el evaluador.

---

## 7. CI/CD y despliegue en AWS

**Nube activa desde la Sesión 8, cómputo en ECS Fargate desde la Sesión 9.** El diseño original apuntaba a GCP (ver el Anexo al final de esta sección) — la cuenta de facturación de GCP quedó bloqueada por el error `OR-CBAT-23`, sin resolución posible desde este lado, y el proyecto migró a AWS. Dentro de AWS, el plan original de cómputo era App Runner (Sesión 8) — **intentado, bloqueado por una restricción de producto de AWS** (App Runner dejó de aceptar clientes nuevos desde el 30 de abril de 2026, y la cuenta de este proyecto se creó después de ese corte; ver PROGRESS.md Sesión 9 para el detalle completo, incluida la respuesta real de AWS). El pivot a ECS Fargate reemplaza únicamente la capa de cómputo — reutiliza el mismo ECR, la misma RDS y los mismos 3 secretos ya provisionados en la Sesión 8. La arquitectura de aplicación (hexagonal, Docker) es la misma sin ningún cambio de código en ninguno de los dos pivots (GCP→AWS, App Runner→ECS); lo que cambió cada vez es exclusivamente la infraestructura y el pipeline.

```
GitHub → GitHub Actions (trigger en push a main, .github/workflows/deploy.yml)
   ├── Backend:  install → prisma generate → test contra Postgres efímero
   │             (coverage gate real, test:cov) → Docker build → push a ECR
   │             (tags: SHA del commit + latest)
   │             → step explícito `aws ecs update-service
   │               --force-new-deployment` + `aws ecs wait services-stable`
   │               (Sesión 9.5) — a diferencia de App Runner (que hubiera
   │               vigilado `latest` solo, vía AutoDeploymentsEnabled), ECS
   │               Fargate necesita este trigger explícito para que un push
   │               a `main` efectivamente redespliegue la tarea con la
   │               imagen nueva. Pendiente: el rol OIDC todavía no tiene el
   │               permiso IAM de ECS que este step necesita (ver
   │               PROGRESS.md Sesión 9.5 para el comando exacto)
   ├── Frontend: build (ng build --prod) → deploy a Firebase Hosting (sin cambios de la Sesión 0)
   └── DB:       RDS (Postgres) — igual que con Cloud SQL, las migraciones de
                 Prisma NO corren automáticamente contra la base de
                 producción en ningún pipeline (ni el de GCP ni el actual) —
                 es un paso manual documentado en README.md, sección
                 "Checklist de AWS", ya ejecutado una vez en la Sesión 9.
```

- **Secrets Manager**: `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET` — nunca en el repo. Inyectados a la tarea de ECS vía el campo `secrets` (no `environment`) de la definición de contenedor — equivalente funcional al `RuntimeEnvironmentSecrets` que habría usado App Runner.
- **ECR** (Elastic Container Registry): reemplaza a Artifact Registry — mismo rol, registro de imágenes Docker privado. Sin cambios entre los dos pivots.
- **ECS Fargate**: reemplaza a App Runner (que a su vez habría reemplazado a Cloud Run). Backend containerizado corriendo como tarea Fargate (512 CPU / 1024 memoria), sin Load Balancer — la tarea recibe una IP pública directa (subnets públicas de la VPC por defecto), trade-off deliberado para esta demo: la IP puede cambiar si ECS reemplaza la tarea (redeploy, fallo de health check), algo que en un entorno real se resolvería con un Application Load Balancer + DNS estable. A diferencia de App Runner, ECS Fargate tampoco escala a cero — mismo trade-off de costo que ya se había aceptado en la Sesión 8, sin cambios.
- **RDS**: reemplaza a Cloud SQL. Conexión por **TCP/TLS estándar** (`sslmode=require`), no por Cloud SQL Auth Proxy/socket Unix — la instancia se creó públicamente accesible (trade-off deliberado, documentado en `aws-setup.sh`), así que no hace falta un VPC connector ni ningún mecanismo de proxy integrado. Ver README.md, sección "Conexión ECS Fargate ↔ RDS".
- **Autenticación de GitHub Actions vía OIDC**: `aws-actions/configure-aws-credentials` asume un rol IAM (`findash-github-actions-deploy`) con un proveedor OIDC de confianza hacia `token.actions.githubusercontent.com` — nunca access keys de larga duración guardadas como secreto de GitHub. Mismo principio de seguridad que ya regía para JWT/passwords en el resto del proyecto: nada sensible de larga vida vive en texto plano en un secreto de CI. La trust policy real requiere tanto `sts:AssumeRoleWithWebIdentity` como `sts:TagSession` (esta última porque `aws-actions/configure-aws-credentials@v4` agrega session tags automáticamente), y un `sub` con el formato real que GitHub emite para este repo (incluye los IDs numéricos de owner/repositorio, no solo `OWNER/REPO`) — ver PROGRESS.md Sesión 9 para cómo se diagnosticó.
- **Firebase Hosting**: sin cambios respecto al diseño original — sigue sirviendo el build de Angular, no depende de qué nube ni qué servicio de cómputo aloja el backend.

Detalle completo de recursos reales, comandos de setup (`aws-setup.sh`, `ecs-setup.sh`), y la verificación de `/health` en producción: README.md, sección "Checklist de AWS".

### Anexo — App Runner (intentado, bloqueado por restricción de producto de AWS, ver PROGRESS.md Sesión 9)

Plan original de cómputo dentro de AWS (Sesión 8): los dos roles IAM que necesitaba (`findash-apprunner-ecr-access` para el `pull` de ECR, `findash-apprunner-instance` para leer los 3 secretos en runtime) se crearon correctamente vía `apprunner-roles-setup.sh` y siguen existiendo, sin uso, sin costo. El bloqueo apareció un paso después, al ejecutar `aws apprunner create-service`: `SubscriptionRequiredException`. Causa confirmada — no un error de configuración de este proyecto: **AWS App Runner dejó de aceptar clientes nuevos a partir del 30 de abril de 2026**, y la cuenta de AWS de este proyecto se creó el 27 de agosto de 2026, después de ese corte. Reemplazado por ECS Fargate (ver arriba) — mismo ECR, misma RDS, mismos secretos, cero cambios de código de aplicación.

### Anexo — despliegue alternativo en GCP (no usado, ver PROGRESS.md Sesión 8)

Diseño original de este proyecto (Sesiones 0-7), documentado acá por completitud y porque el pipeline (`infra/gcp/cloudbuild.yaml.bak`) sí se construyó y se validó como YAML bien formado — solo nunca llegó a correr contra un proyecto real de GCP por el bloqueo de facturación (`OR-CBAT-23`).

```
GitHub → Cloud Build (trigger en push a main)
   ├── Backend:  build → test (coverage gate) → Docker build → push a Artifact Registry
   │             → deploy a Cloud Run
   ├── Frontend: build (ng build --prod) → deploy a Firebase Hosting
   └── DB:       Cloud SQL (Postgres) — migraciones de Prisma vía Cloud Build step
```

- **Secret Manager**: `JWT_SECRET`, `DATABASE_URL` — nunca en el repo.
- **Cloud Run**: backend containerizado, escala a cero (ideal para demo/evaluación, costo ~$0 en reposo) — a diferencia de App Runner, esta era una ventaja real de costo que se perdió en el pivot, aceptada conscientemente a cambio de tener *algún* proveedor cloud funcionando.
- **Cloud SQL**: conexión vía Cloud SQL Auth Proxy o Unix socket desde Cloud Run.
- **Firebase Hosting**: sirve el build de Angular con CDN global, gratis en el tier de evaluación.

---

## 8. Roadmap de desarrollo sugerido (para las sesiones con Claude Code)

1. **Fase 0** — Scaffolding: monorepo, NestJS + Prisma schema, Angular workspace, Docker Compose local (Postgres).
2. **Fase 1** — Auth + RBAC (RF-01, RF-02) end-to-end.
3. **Fase 2** — Módulo de cuentas: listado paginado + filtros + avatares (RF-03, RF-04).
4. **Fase 3** — Núcleo transaccional: strategies de comisión, use case orquestador, locks de concurrencia (RN-03, RN-04, RNF-01).
5. **Fase 4** — Idempotencia + anti-fraude simulado (RN-01, RN-02).
6. **Fase 5** — Dashboard: KPIs + gráfico, lazy loading (RF-07, RF-08, RNF-04).
7. **Fase 6** — Tests hasta cobertura > 80%.
8. **Fase 7** — Dockerización + despliegue en la nube + CI/CD (GCP originalmente, pivot a AWS en la Sesión 8 — ver sección 7).
9. **Fase 8** — Preparar guion de sustentación (ver sección 9).

---

## 9. Guion sugerido para la sustentación (10 min + 5 min preguntas)

| Minuto | Contenido |
|---|---|
| 0-1 | Contexto del negocio en una frase: comisiones dinámicas, necesidad de escalar reglas sin reescribir. |
| 1-3 | Mostrar el Strategy Pattern en vivo: agregar una cuenta "VIP" nueva en 30 segundos de código, sin tocar el use case → esto es tu momento estelar, practícalo. |
| 3-5 | Mostrar el use case orquestador y explicar por qué el controlador está "vacío" de lógica (SRP). |
| 5-6 | Demo de idempotencia: doble clic real en el form, mostrar que no se duplica. |
| 6-7 | Demo de concurrencia: dos transferencias simultáneas a la misma cuenta, saldo nunca negativo. |
| 7-8 | Dashboard desplegado en AWS (ECS Fargate + RDS) en producción — y, si preguntan, la historia de los dos pivots (GCP→AWS por `OR-CBAT-23`, y App Runner→ECS Fargate por el corte de nuevos clientes del 30 abr 2026) como ejemplo real de decisiones de arquitectura bajo restricción externa. |
| 8-9 | Cobertura de tests (mostrar reporte). |
| 9-10 | Cierre: qué patrón usarías para el siguiente requisito hipotético que te pregunten. |

**Prepárate para la pregunta trampa más probable**: *"¿Qué pasa si mañana la comisión depende de dos factores, no solo el tipo de cuenta?"* → Respuesta: el Strategy sigue funcionando, solo cambia la firma de `calculate()` para aceptar un contexto más rico (`CommissionContext`), sin tocar el Factory ni el Use Case.

---

## 10. Anexo — Justificación ACID (RNF-01)

RNF-01 pide explícitamente "elección justificada de base de datos". Esto casi seguro se pregunta en la sustentación — prepáralo casi de memoria.

### La pregunta trampa real: "¿por qué Postgres y no algo NoSQL que también escala?"

Respuesta corta: una billetera digital es el ejemplo de libro de texto de un sistema donde la consistencia importa más que la velocidad de escritura masiva o la disponibilidad ante partición de red. Mover dinero entre dos cuentas *es* una transacción ACID por definición — o se completa entera, o no pasa nada; nunca un estado intermedio donde una cuenta ya perdió el dinero y la otra todavía no lo recibió. Postgres da estas garantías de forma nativa y madura. Un motor documental (Mongo, Firestore) puede simular transacciones multi-documento, pero es una capacidad más nueva, más cara en performance, y resolviendo un problema que el modelo relacional ya resuelve desde hace décadas.

### ACID → decisión de diseño → dónde se demuestra en el código

| Principio | Qué garantiza | Cómo se implementa en FinDash | Dónde se ve |
|---|---|---|---|
| **Atomicity** | La transferencia se completa entera o no pasa nada — nunca un estado a medias. | Toda la operación (validar fondos, calcular comisión, debitar origen, acreditar destino, crear `Transaction`) vive dentro de una única transacción de Prisma. Si cualquier paso falla, se revierte todo. | `CreateTransferUseCase` (Sesión 4) + el test explícito de la Sesión 6 que verifica que un timeout de anti-fraude no deja saldos tocados a medias. |
| **Consistency** | La base nunca permite un estado inválido, sin importar qué bug tenga la lógica de aplicación por encima. | `Decimal(14,2)` en vez de `Float` para todo el dinero (precisión IEEE 754, ver comentario en el schema); enums cerrados (`AccountType`, `AccountStatus`, `TransactionStatus`); constraints `UNIQUE` en `accountNumber`, `idempotencyKey`, `documentNumber`. | `schema.prisma`, migración `domain_model` de la Sesión 1. |
| **Isolation** | Dos transferencias simultáneas sobre la misma cuenta no pueden leer un saldo "viejo" y pisarse una a la otra. | `SELECT ... FOR UPDATE` sobre ambas cuentas, bloqueadas siempre en orden ascendente por `id` (evita deadlocks) — respuesta directa a la advertencia explícita del enunciado ("evitar que dos retiros simultáneos dejen una cuenta en negativo"). | `CreateTransferUseCase` reforzado en la Sesión 5 + test de integración con dos transferencias concurrentes reales. |
| **Durability** | Una vez el commit se confirma, el dato sobrevive a un crash. | Garantía nativa de Postgres (WAL) — en RDS (AWS, desde la Sesión 8), sin backups automáticos habilitados (`--backup-retention-period 0` en `aws-setup.sh`, trade-off deliberado de alcance/costo para esta demo, documentado en el propio script). La durabilidad de cada commit individual no depende de esa configuración; la recuperación ante la pérdida completa de la instancia sí, y es un gap conocido, no un descuido silencioso. | Nivel de infraestructura (AWS), no de código de aplicación. |

### El otro ángulo que también preguntan: "¿por qué no confiar en la aplicación (Node.js) para evitar el saldo negativo, sin bloqueos en la base de datos?"

Porque el event loop de Node es de un solo hilo lógico, pero eso **no** protege contra condiciones de carrera entre dos requests HTTP concurrentes: el patrón "leer saldo → calcular → escribir saldo" no es atómico en memoria de la aplicación, sin importar que JavaScript no tenga hilos paralelos reales — dos requests pueden intercalarse en el `await` entre la lectura y la escritura. La única forma de garantizar atomicidad real en ese punto es empujar la sección crítica a donde sí existe: la base de datos, vía locks explícitos o aislamiento serializable.
