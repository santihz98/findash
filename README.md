# FinDash — Billetera Digital

Monorepo del proyecto FinDash — billetera digital con backend NestJS (arquitectura hexagonal) desplegado en AWS. Ver la sección "Arquitectura" más abajo para el diseño técnico.

```
.
├── backend/                                # NestJS + Prisma (arquitectura hexagonal)
├── frontend/                               # Angular (standalone, NgRx) — ver sección "Frontend" abajo
├── docker-compose.yml                      # Postgres + backend para desarrollo local
├── .github/workflows/deploy.yml            # CI/CD backend: test → build → push a ECR → redeploy ECS
├── .github/workflows/deploy-frontend.yml   # CI/CD frontend: test → build → aws s3 sync
├── aws-setup.sh                            # Setup inicial de AWS (ECR, RDS, Secrets Manager, rol OIDC) — ya corrido
├── apprunner-roles-setup.sh                # Roles de App Runner (Access/Instance) — creados, sin uso (ver "Checklist de AWS" abajo)
├── ecs-setup.sh                            # Cluster/servicio ECS Fargate (reemplaza a App Runner) — ya corrido
├── s3-frontend-setup.sh                    # Bucket S3 del frontend (static website hosting) — ya corrido
├── validate-production.sh                  # Validación end-to-end contra producción (ver "Checklist de AWS" abajo)
└── infra/gcp/cloudbuild.yaml.bak           # Pipeline original de GCP — no usado, reemplazado por AWS
```

---

## Arquitectura

**Backend — arquitectura hexagonal (Clean Architecture).** Cada módulo de negocio (`auth`, `accounts`, `transactions`, `dashboard`) se organiza en `domain/` (entidades y puertos, sin dependencias externas), `application/` (casos de uso), `infrastructure/` (adaptadores Prisma) e `interfaces/` (controllers, DTOs, guards). El dominio nunca importa Prisma ni Express directamente — se comunica con la infraestructura a través de interfaces, lo que permite testear las reglas de negocio con dobles de prueba en memoria y mantener la lógica financiera aislada de detalles de framework/DB.

**Patrones de diseño centrales:**
- **Strategy + Factory** para el cálculo de comisiones por tipo de cuenta (BASIC 2%, PREMIUM 0%, CORPORATE $5 fijo) — agregar un tipo de cuenta nuevo no requiere tocar el caso de uso que orquesta la transferencia.
- **Repository** para toda la persistencia: los casos de uso dependen de interfaces (`IAccountRepository`, `ITransactionRepository`, etc.), nunca del ORM directamente.
- **Excepciones de dominio + filtro global de HTTP**: las reglas de negocio (fondos insuficientes, cuenta destino inexistente, etc.) lanzan excepciones propias que un filtro central traduce a códigos HTTP — el dominio no sabe nada de HTTP.

**Reglas de negocio no triviales implementadas:**
- **Idempotencia real** (header `X-Idempotency-Key`, obligatorio en transferencias): reintentar la misma request con la misma key devuelve la respuesta original en vez de duplicar la operación.
- **Concurrencia sin condiciones de carrera**: los balances se bloquean con `SELECT ... FOR UPDATE` en un orden determinístico (por id, no por rol origen/destino), lo que evita tanto el double-spend como deadlocks entre transferencias cruzadas simultáneas.
- **Timeout de anti-fraude**: cada transferencia consulta un servicio anti-fraude simulado vía `Promise.race` contra un límite de 3 segundos — si no responde a tiempo, la operación se rechaza sin efectos secundarios (nada se debita ni acredita).

**Stack:** backend NestJS 11 + TypeScript + Prisma + PostgreSQL; frontend Angular 21 (standalone) + NgRx, config de backend cargada en runtime (ver sección "Frontend" abajo) — todavía sin features de negocio; Docker para desarrollo local; en producción, AWS (ECS Fargate + RDS + ECR + Secrets Manager + S3 para el frontend), con CI/CD en GitHub Actions autenticado vía OIDC (sin credenciales de larga duración).

**Testing:** cobertura de código con umbral mínimo del 80% (statements/branches/functions/lines), verificado como gate real en el pipeline de CI, no solo en local. Incluye tests de integración contra una base de datos Postgres real (no solo mocks) para los flujos con lógica sensible a condiciones de carrera (transferencias concurrentes, idempotencia).

---

## Desarrollo local

Requisitos: Docker Desktop, Node.js 22+.

> Nota: Postgres se expone en el host en el puerto **5433** (no 5432) para no
> chocar con un Postgres nativo que ya puedas tener corriendo localmente.
> Dentro de la red de Docker, `backend` sigue hablando con `postgres:5432`
> normalmente — el remapeo solo afecta accesos desde el host (psql, Prisma
> CLI, DBeaver, etc.).

```bash
# 1. Levanta Postgres + backend
docker compose up -d --build

# 2. Verifica el health check
curl http://localhost:3000/health
# → {"status":"ok","database":"connected"}

# 3. Apagar
docker compose down          # conserva el volumen de datos
docker compose down -v       # borra también el volumen de datos
```

### Documentación interactiva de la API (Swagger/OpenAPI)

Con el backend arriba (Docker o `npm run start:dev`), abrí **http://localhost:3000/api/docs**. Incluye botón "Authorize" (Bearer JWT): pegá el `accessToken` de `POST /auth/login` ahí para probar los endpoints protegidos directamente desde el navegador, sin `curl`. El spec crudo está en `/api/docs-json`.

### Desarrollo sin Docker para el backend

Útil para hot-reload rápido. Deja Postgres en Docker y corre Nest en local:

```bash
docker compose up -d postgres
cd backend
cp .env.example .env   # ya apunta a localhost:5433, coincide con docker-compose.yml
npm install
npm run prisma:generate
npm run start:dev
```

### Probar Auth (Sesión 2) con curl

Requiere la base sembrada (`npm run prisma:migrate:deploy && npm run prisma:seed`, o `npx prisma db seed` — crea los 4 usuarios de demo, uno por rol/tipo de cuenta). Password de todos: `Demo1234!`.

```bash
# Login — probar con admin@findash.dev / basic@findash.dev / premium@findash.dev / corporate@findash.dev
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@findash.dev","password":"Demo1234!"}'
# → {"accessToken":"...", "refreshToken":"..."}

# Guarda el accessToken y prueba el endpoint protegido
TOKEN="pega-aca-el-accessToken"
curl -s http://localhost:3000/auth/me -H "Authorization: Bearer $TOKEN"
# → {"id":"...","email":"admin@findash.dev","documentNumber":"1010000001","role":"ADMIN"}

# Sin token → 401
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/auth/me

# Refresh — usa el refreshToken del login para obtener un accessToken nuevo
REFRESH="pega-aca-el-refreshToken"
curl -s -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH\"}"
# → {"accessToken":"..."}
```

### Probar Accounts (Sesión 3) con curl

`GET /accounts` es solo-ADMIN; `GET /accounts/me` funciona con cualquier rol.

```bash
ADMIN_TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@findash.dev","password":"Demo1234!"}' | python3 -c "import json,sys;print(json.load(sys.stdin)['accessToken'])")

# Listado paginado (defaults: page=1, limit=20)
curl -s http://localhost:3000/accounts -H "Authorization: Bearer $ADMIN_TOKEN"

# Filtro por documento del titular (prefijo) + status, combinables
curl -s "http://localhost:3000/accounts?documentNumber=1010000&status=ACTIVE" -H "Authorization: Bearer $ADMIN_TOKEN"

# page=0 y limit excesivo -> 400 (Bad Request), no se recortan en silencio
curl -s -w "\n%{http_code}\n" "http://localhost:3000/accounts?page=0" -H "Authorization: Bearer $ADMIN_TOKEN"
curl -s -w "\n%{http_code}\n" "http://localhost:3000/accounts?limit=999999" -H "Authorization: Bearer $ADMIN_TOKEN"

# Un CLIENT recibe 403 acá
CLIENT_TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"basic@findash.dev","password":"Demo1234!"}' | python3 -c "import json,sys;print(json.load(sys.stdin)['accessToken'])")
curl -s -w "\n%{http_code}\n" http://localhost:3000/accounts -H "Authorization: Bearer $CLIENT_TOKEN"

# /me: cualquier rol, siempre solo sus propias cuentas
curl -s http://localhost:3000/accounts/me -H "Authorization: Bearer $CLIENT_TOKEN"
```

### Probar Transactions (Sesión 4/5/6) con curl

`POST /transactions/transfer` es solo-CLIENT. El origen siempre es la cuenta del usuario autenticado (no se pide en el body) — cada CLIENT de demo tiene exactamente 1 cuenta, así que alcanza con loguearse. Desde la Sesión 5, el header `X-Idempotency-Key` es **obligatorio** (RN-01) — sin él, 400.

**Anti-fraude simulado con timeout (RN-02):** antes de confirmar cualquier transferencia, el backend consulta un servicio anti-fraude simulado que demora aleatoriamente entre 1 y 10 segundos — si tarda más de 3s, la request corta con **504** (no se debita ni acredita nada) en vez de completarse. Con el delay uniforme en ese rango, alrededor del 78% de los intentos reales va a caer en 504 y el resto en 201 — es un comportamiento esperado del timeout simulado, no un bug. Repetir el mismo comando de abajo varias veces con una key nueva cada vez para ver ambos casos.

```bash
BASIC_TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"basic@findash.dev","password":"Demo1234!"}' | python3 -c "import json,sys;print(json.load(sys.stdin)['accessToken'])")

# id de la cuenta PREMIUM (destino) desde el listado de admin
ADMIN_TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@findash.dev","password":"Demo1234!"}' | python3 -c "import json,sys;print(json.load(sys.stdin)['accessToken'])")
PREMIUM_ID=$(curl -s http://localhost:3000/accounts -H "Authorization: Bearer $ADMIN_TOKEN" \
  | python3 -c "import json,sys;d=json.load(sys.stdin)['data'];print([a['id'] for a in d if a['accountType']=='PREMIUM'][0])")

# Sin X-Idempotency-Key -> 400 (Sesión 5, RN-01)
curl -s -w "\n%{http_code}\n" -X POST http://localhost:3000/transactions/transfer \
  -H "Authorization: Bearer $BASIC_TOKEN" -H "Content-Type: application/json" \
  -d "{\"destAccountId\":\"$PREMIUM_ID\",\"amount\":\"100\"}"

# BASIC (2%) -> PREMIUM: $100 debita $102.00 del origen, acredita $100.00 al destino
KEY=$(python3 -c "import uuid;print(uuid.uuid4())")
curl -s -X POST http://localhost:3000/transactions/transfer \
  -H "Authorization: Bearer $BASIC_TOKEN" -H "Content-Type: application/json" -H "X-Idempotency-Key: $KEY" \
  -d "{\"destAccountId\":\"$PREMIUM_ID\",\"amount\":\"100\"}"
# → {"id":"...","originAccountId":"...","destAccountId":"...","amount":"100.00","commission":"2.00","authorizationCode":"...","status":"COMPLETED","createdAt":"..."}

# Reenviar la MISMA key -> misma respuesta, no duplica la fila en transactions
curl -s -X POST http://localhost:3000/transactions/transfer \
  -H "Authorization: Bearer $BASIC_TOKEN" -H "Content-Type: application/json" -H "X-Idempotency-Key: $KEY" \
  -d "{\"destAccountId\":\"$PREMIUM_ID\",\"amount\":\"100\"}"

# Fondos insuficientes -> 422 (no 500) — cada request necesita su propia key nueva
curl -s -w "\n%{http_code}\n" -X POST http://localhost:3000/transactions/transfer \
  -H "Authorization: Bearer $BASIC_TOKEN" -H "Content-Type: application/json" -H "X-Idempotency-Key: $(python3 -c 'import uuid;print(uuid.uuid4())')" \
  -d "{\"destAccountId\":\"$PREMIUM_ID\",\"amount\":\"999999\"}"

# amount=0 -> 400 (Bad Request, DTO)
curl -s -w "\n%{http_code}\n" -X POST http://localhost:3000/transactions/transfer \
  -H "Authorization: Bearer $BASIC_TOKEN" -H "Content-Type: application/json" -H "X-Idempotency-Key: $(python3 -c 'import uuid;print(uuid.uuid4())')" \
  -d "{\"destAccountId\":\"$PREMIUM_ID\",\"amount\":\"0\"}"

# Un ADMIN no puede transferir (403) — el endpoint es solo-CLIENT
curl -s -w "\n%{http_code}\n" -X POST http://localhost:3000/transactions/transfer \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -H "X-Idempotency-Key: $(python3 -c 'import uuid;print(uuid.uuid4())')" \
  -d "{\"destAccountId\":\"$PREMIUM_ID\",\"amount\":\"10\"}"
```

---

## Frontend

Angular 21 (standalone components, sin NgModules), NgRx (`@ngrx/store` + `@ngrx/effects` + `@ngrx/store-devtools`), Vitest como test runner (default del builder `@angular/build:unit-test` de esta versión de Angular).

### Correr en local

```bash
cd frontend
npm install
ng serve
# → http://localhost:4200
```

`src/app/core/config/config.json` en el bucket de S3 no se toca al correr en local — `ng serve` sirve directamente `frontend/public/assets/config.json` (valor de desarrollo, `{"apiUrl": "http://localhost:3000"}`), así que apunta al backend corriendo en Docker/`start:dev` sin ningún paso extra. `CORS_ORIGIN` del backend ya incluye `http://localhost:4200` (ver "Checklist de AWS", sección 5), así que también podés apuntar el frontend local contra el backend real de AWS con solo cambiar ese archivo.

### Config en runtime (por qué no es un `environment.ts`)

La URL del backend **no** vive en un archivo que el bundler compile (`environment.ts`, `environment.prod.ts`). La tarea ECS Fargate no tiene Load Balancer (trade-off deliberado, ver `ecs-setup.sh`), así que su IP pública puede cambiar en cualquier redeploy — si la URL viviera hardcodeada en un archivo compilado, cada cambio de IP forzaría recompilar y resubir todo el frontend solo para actualizar un string.

En cambio, la URL vive en `frontend/public/assets/config.json` — un archivo estático, servido tal cual (sin pasar por el bundler), que Angular carga en runtime **antes** de que cualquier componente arranque:

- `ConfigService` (`frontend/src/app/core/config/config.service.ts`) hace `fetch('assets/config.json')` — `fetch` nativo, no `HttpClient`, para evitar una dependencia circular con el interceptor de abajo (que necesita la config ya cargada para poder funcionar).
- `provideAppConfigInitializer()` (`config.initializer.ts`) registra esa carga vía `provideAppInitializer` — el equivalente moderno de `APP_INITIALIZER` para standalone apps (Angular 19+). Angular bloquea el bootstrap hasta que la promesa resuelve: **no existe forma de que un componente arranque sin la config ya cargada**.
- `apiConfigInterceptor` (`core/interceptors/api-config.interceptor.ts`) reescribe cada request HTTP relativa (ej. `auth/login`) a una URL absoluta contra `ConfigService.apiUrl` — así ningún servicio individual hardcodea la URL del backend.

**Cambiar la URL del backend en producción sin recompilar el frontend** (por ejemplo, después de un redeploy de ECS que le asignó una IP pública nueva):

```bash
echo '{"apiUrl": "http://<IP_PUBLICA_NUEVA>:3000"}' > /tmp/config.json
aws s3 cp /tmp/config.json s3://findash-frontend-7874505/assets/config.json \
  --content-type application/json \
  --region us-east-2
```

Sin rebuild, sin redeploy del pipeline — el próximo `fetch` (el siguiente refresh de cualquier usuario) ya ve la IP nueva. **El pipeline de CI/CD (`deploy-frontend.yml`) nunca toca este archivo** (excluido explícitamente del `aws s3 sync`, ver el workflow) — si lo tocara, cada deploy de una feature nueva pisaría silenciosamente la URL real de producción con el valor de desarrollo que vive en el repo.

### Estructura

```
frontend/src/app/
├── core/            # ConfigService, apiConfigInterceptor, guards (a futuro)
├── state/           # NgRx: store raíz vacío hoy, un folder por feature a futuro (auth/, accounts/, ...)
├── features/        # Páginas (home/ hoy — placeholder de "/")
└── shared/          # Componentes/directivas reutilizables (vacío hoy)
```

---

## Checklist de AWS (pasos manuales, ya ejecutados — deploy validado en producción)

**Pivot de GCP a AWS:** la cuenta de facturación de GCP quedó bloqueada por el error `OR-CBAT-23`, sin resolución posible desde este lado. El checklist de GCP original (Cloud Run + Cloud SQL + Artifact Registry + Cloud Build) y su pipeline quedan documentados sin borrar en [infra/gcp/cloudbuild.yaml.bak](./infra/gcp/cloudbuild.yaml.bak) — es evidencia real de trabajo hecho y de una decisión de arquitectura tomada bajo una restricción externa, no técnica.

**Segundo pivot, de App Runner a ECS Fargate:** al intentar `aws apprunner create-service`, AWS respondió `SubscriptionRequiredException: The AWS Access Key Id needs a subscription for the service`. Causa confirmada: **App Runner dejó de aceptar clientes nuevos desde el 30 de abril de 2026** — la cuenta de AWS de este proyecto se creó después de ese corte, así que nunca tuvo acceso al servicio, sin importar la configuración de roles/permisos (que sí estaba correcta). Es una restricción de producto de AWS, no un error de este proyecto. Los dos roles de App Runner (`findash-apprunner-ecr-access`, `findash-apprunner-instance`, creados por [apprunner-roles-setup.sh](./apprunner-roles-setup.sh)) quedan sin usar — no se borraron porque no generan costo, pero **no forman parte del deploy activo**. El cómputo real hoy es 100% ECS Fargate.

Todos los scripts de esta sección ya corrieron manualmente contra la cuenta de AWS real (`683342010199`, `us-east-2`) — los recursos de abajo ya existen y el backend está sirviendo tráfico real en producción.

**Trigger del pipeline acotado por path (monorepo):** este es un monorepo (`backend/` + `frontend/`), y `.github/workflows/deploy.yml` corre tests, build, push a ECR y redeploy de ECS — nada de eso tiene sentido para un cambio que solo toca el frontend. El trigger (`on.push`) tiene un filtro `paths: ['backend/**', '.github/workflows/deploy.yml']`: **un push que solo modifica `frontend/` no dispara este pipeline**, evitando minutos de CI desperdiciados y un redeploy (con el cambio de IP pública que eso implica) sin ningún motivo real. El workflow se incluye a sí mismo en el filtro a propósito, para que un ajuste al pipeline también se pruebe corriéndolo. El frontend tiene su propio workflow separado ([.github/workflows/deploy-frontend.yml](./.github/workflows/deploy-frontend.yml)) con su propio filtro `paths: ['frontend/**', '.github/workflows/deploy-frontend.yml']` y su propio job de `aws s3 sync` contra el bucket `findash-frontend-7874505` — un push que solo toca `backend/` no lo dispara, y viceversa.

### Recursos ya aprovisionados y en uso

| Recurso | Valor |
|---|---|
| Región AWS | `us-east-2` |
| Cuenta AWS | `683342010199` |
| ECR | `683342010199.dkr.ecr.us-east-2.amazonaws.com/findash-backend` |
| RDS endpoint | `findash-db.c3iyyk8209g1.us-east-2.rds.amazonaws.com` |
| Rol GitHub Actions (OIDC) | `arn:aws:iam::683342010199:role/findash-github-actions-deploy` |
| ECS cluster | `findash-cluster` |
| ECS service | `findash-backend-service` |
| ECS task definition | `findash-backend` (Fargate, 512 CPU / 1024 memoria) |
| ECS Task Execution Role | `arn:aws:iam::683342010199:role/findash-ecs-execution` |
| ECS Task Role | `arn:aws:iam::683342010199:role/findash-ecs-task` |
| CloudWatch Logs group | `/ecs/findash-backend` |
| Security group (servicio) | `findash-ecs-sg` (puerto 3000 abierto a `0.0.0.0/0`) |
| Secret `DATABASE_URL` | `arn:aws:secretsmanager:us-east-2:683342010199:secret:findash/DATABASE_URL-VA15k5` |
| Secret `JWT_SECRET` | `arn:aws:secretsmanager:us-east-2:683342010199:secret:findash/JWT_SECRET-CQMrZG` |
| Secret `JWT_REFRESH_SECRET` | `arn:aws:secretsmanager:us-east-2:683342010199:secret:findash/JWT_REFRESH_SECRET-YuNBle` |

- `aws-setup.sh` creó: el repositorio ECR, la instancia RDS Postgres (free tier, públicamente accesible — trade-off deliberado documentado dentro del propio script, ver la sección "Qué NO hace"), los 3 secretos en Secrets Manager, y el rol IAM + proveedor OIDC para que GitHub Actions se autentique sin access keys de larga duración.
- `ecs-setup.sh` creó todo lo de cómputo (reemplaza a `apprunner-roles-setup.sh`, ver abajo): el Task Execution Role (pull de ECR + `AmazonECSTaskExecutionRolePolicy` + lectura de los 3 secretos al arrancar el contenedor), el Task Role (sin permisos adicionales hoy — se deja preparado por si el backend necesita llamar a otro servicio de AWS en el futuro), el grupo de logs de CloudWatch, el cluster, el security group, la task definition, y el servicio (1 tarea deseada, subnets públicas de la VPC por defecto, IP pública asignada directamente).
- `apprunner-roles-setup.sh` creó los dos roles de App Runner — quedan documentados por completitud, pero el servicio que los habría usado nunca se pudo crear (ver el pivot de arriba).

### 1. Configurar los 3 secretos del repositorio en GitHub

Settings > Secrets and variables > Actions > New repository secret:

```
AWS_DEPLOY_ROLE_ARN = arn:aws:iam::683342010199:role/findash-github-actions-deploy
AWS_REGION           = us-east-2
ECR_REPOSITORY       = findash-backend
```

El workflow ([.github/workflows/deploy.yml](./.github/workflows/deploy.yml)) los usa para autenticarse vía OIDC (`aws-actions/configure-aws-credentials`, sin ningún access key guardado como secreto) y para saber a qué repositorio de ECR pushear.

### 2. Migrar el schema contra la RDS real (una sola vez, y de nuevo cada vez que `schema.prisma` cambie)

Ni el workflow de GitHub Actions ni (antes) `cloudbuild.yaml` corren `prisma migrate deploy` contra la base de datos de **producción** — ambos pipelines solo migran el Postgres efímero que usan para los tests. Esto es intencional (no hay ninguna razón de negocio para correr una migración de schema en cada push si el schema no cambió), pero significa que hay que hacerlo a mano cuando sí cambia. Como RDS es públicamente accesible (ver trade-off documentado en `aws-setup.sh`), se puede correr desde cualquier máquina con `npm`/`npx` y la contraseña real (la misma que generó `aws-setup.sh` y guardó en el secreto `DATABASE_URL`):

```bash
cd backend
DATABASE_URL="postgresql://findash_app:LA_PASSWORD_REAL@findash-db.c3iyyk8209g1.us-east-2.rds.amazonaws.com:5432/findash?sslmode=require" \
  npx prisma migrate deploy
```

> Recupera la password real (no quedó en ningún archivo del repo, `aws-setup.sh` la generó al vuelo con `openssl rand`) desde el secreto `DATABASE_URL` en Secrets Manager: `aws secretsmanager get-secret-value --secret-id findash/DATABASE_URL --region us-east-2 --query SecretString --output text`.

Ya ejecutado en producción: las 3 migraciones (`domain_model`, `add_user_document_number`, `audit_rejected_failed_transactions`) se aplicaron limpio contra la RDS real, y `prisma db seed` corrió sobre la misma base — los 4 usuarios de demo (`admin`/`basic`/`premium`/`corporate@findash.dev`) existen en producción.

### 3. Servicio ECS Fargate (ya creado — `ecs-setup.sh`, reemplaza al paso de App Runner)

A diferencia de App Runner, no hay un único comando `create-service` de una sola vez: [ecs-setup.sh](./ecs-setup.sh) crea el cluster, la task definition y el servicio juntos (ver el detalle de cada recurso en la tabla de arriba). Ya corrió contra la cuenta real.

**Redeploy automático en cada push:** App Runner, con `AutoDeploymentsEnabled=true`, vigilaba el tag `latest` de ECR y redesplegaba solo — ECS Fargate no tiene ese comportamiento nativo. `.github/workflows/deploy.yml` (job `build-and-push`) lo resuelve con dos steps explícitos después del push a ECR: `aws ecs update-service --cluster findash-cluster --service findash-backend-service --force-new-deployment`, seguido de `aws ecs wait services-stable` para que el job falle si la imagen nueva no levanta. El rol `findash-github-actions-deploy` tiene una policy inline acotada al ARN del servicio (`ecs:UpdateService` + `ecs:DescribeServices`, no acceso total a ECS) para poder correr ambos steps.

Obtené la IP pública actual de la tarea (puede cambiar si ECS la reemplaza — ver el trade-off documentado en `ecs-setup.sh` sobre no usar Load Balancer):

```bash
TASK_ARN=$(aws ecs list-tasks --cluster findash-cluster --service-name findash-backend-service --region us-east-2 --query 'taskArns[0]' --output text)
ENI_ID=$(aws ecs describe-tasks --cluster findash-cluster --tasks $TASK_ARN --region us-east-2 --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' --output text)
aws ec2 describe-network-interfaces --network-interface-ids $ENI_ID --region us-east-2 --query 'NetworkInterfaces[0].Association.PublicIp' --output text
```

```bash
curl http://<IP_PUBLICA>:3000/health
# → {"status":"ok","database":"connected"}
```

### 4. Validación end-to-end automatizada (`validate-production.sh`)

`./validate-production.sh <IP_PUBLICA>` corre 15 checks reales contra el backend en producción: health check, Swagger, login de los 4 usuarios del seed, RBAC (`/accounts`, `/dashboard/kpis` — 200 para ADMIN, 403 para CLIENT), el header `X-Idempotency-Key` obligatorio, una transferencia real con verificación de que reenviar la misma key no la duplica, y los KPIs del dashboard. El check de la transferencia reintenta hasta 8 veces con keys nuevas por el timeout probabilístico de RN-02 (~78% de los intentos individuales caen en 504 por diseño, no es un fallo del script). Termina con `PASS`/`FAIL` por check y código de salida no-cero si algo falló.

### 5. CORS — habilitar el frontend (S3) sin bloquear el desarrollo local

El backend requiere `CORS_ORIGIN` para arrancar (`ConfigService.getOrThrow`, sin fallback — mismo criterio que `JWT_SECRET`/`JWT_REFRESH_SECRET`, ver `backend/src/shared/config/cors.config.ts`). Es una lista de orígenes separados por coma. El valor real de producción:

```
CORS_ORIGIN=http://localhost:4200,http://findash-frontend-7874505.s3-website.us-east-2.amazonaws.com
```

`http://localhost:4200` se mantiene también en producción, no solo en desarrollo — permite correr el frontend en local (`ng serve`) contra el backend real de AWS sin bloqueos de CORS, útil durante todo el desarrollo del frontend. El frontend se sirve como sitio estático desde S3 (bucket `findash-frontend-7874505`, sin CloudFront ni dominio propio — HTTP en ambos extremos, evita mixed-content sin la complejidad de ALB+ACM+DNS).

`ecs-setup.sh` ya incluye `CORS_ORIGIN` con este valor en la sección `environment` de la task definition (no `secrets` — es una URL pública, no información sensible). **Pendiente como paso manual:** la task definition ya desplegada en producción se registró *antes* de este cambio, así que no tiene `CORS_ORIGIN` todavía — hace falta un `aws ecs register-task-definition` (con la definición actualizada de `ecs-setup.sh`) seguido de `aws ecs update-service --cluster findash-cluster --service findash-backend-service --force-new-deployment --region us-east-2` para que el backend en producción reciba la variable. El redeploy automático de un push normal (Sesión 9.5) no alcanza acá porque no cambia la task definition, solo la imagen.

### 6. Permiso IAM pendiente para `deploy-frontend.yml` (S3)

El rol `findash-github-actions-deploy` (el mismo que usa `deploy.yml` para el backend, vía OIDC) hoy **no tiene ningún permiso de S3** — confirmado con `aws iam list-attached-role-policies` + `aws iam list-role-policies`: solo `AmazonEC2ContainerRegistryPowerUser`, `AWSAppRunnerFullAccess`, y la policy inline `findash-ecs-deploy` (ECS, Sesión 9.5). Sin el fix de abajo, el step `aws s3 sync` de `deploy-frontend.yml` va a fallar con `AccessDenied` en el primer push a `frontend/`.

**Policy inline nueva, acotada al bucket del frontend (mismo criterio de mínimo privilegio que `findash-ecs-deploy`, no un `AmazonS3FullAccess`):**

```bash
cat > /tmp/findash-github-actions-s3-frontend-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::findash-frontend-7874505"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::findash-frontend-7874505/*"
    }
  ]
}
EOF

aws iam put-role-policy \
  --role-name findash-github-actions-deploy \
  --policy-name findash-s3-frontend-deploy \
  --policy-document file:///tmp/findash-github-actions-s3-frontend-policy.json \
  --region us-east-2
```

(`s3:ListBucket` sobre el bucket porque `aws s3 sync` necesita listar el contenido actual para calcular el diff antes de subir/borrar; `s3:PutObject`/`s3:DeleteObject` sobre los objetos porque `--delete` puede necesitar borrar archivos que ya no existen en el build nuevo.)

También hace falta un secreto nuevo del repositorio (Settings > Secrets and variables > Actions), además de los 2 que `deploy.yml` ya usa (`AWS_DEPLOY_ROLE_ARN`, `AWS_REGION` — se reutilizan tal cual):

```
S3_FRONTEND_BUCKET = findash-frontend-7874505
```

**No ejecutado desde esta sesión** — mismo criterio que el resto de los cambios de IAM de este proyecto (ver Sesión 9.5): se documenta el comando exacto, no se corre desde una sesión de Claude Code.

### Checklist resumido

- [x] `aws-setup.sh` corrido — ECR, RDS, Secrets Manager, rol OIDC de GitHub Actions.
- [x] `apprunner-roles-setup.sh` corrido — Access Role e Instance Role de App Runner (sin uso, ver el pivot arriba).
- [x] `ecs-setup.sh` corrido — cluster, task definition y servicio ECS Fargate.
- [x] 3 secretos configurados en GitHub (Settings > Secrets and variables > Actions).
- [x] Schema migrado contra la RDS real (`prisma migrate deploy` + `prisma db seed`).
- [x] Push a `main` → workflow corre, sube la imagen a ECR y redespliega el servicio automáticamente (`force-new-deployment` + `wait services-stable`).
- [x] Servicio ECS alcanzó steady state (`runningCount: 1`, sin tareas caídas).
- [x] Permiso IAM `ecs:UpdateService`/`ecs:DescribeServices` aplicado al rol `findash-github-actions-deploy`.
- [x] `validate-production.sh` corrido contra la IP pública real: 15/15 checks en verde.
- [x] Push a `main` verificado end-to-end: el redeploy automático reemplaza la tarea de ECS con la imagen nueva sin intervención manual.
- [ ] `CORS_ORIGIN` agregado a `ecs-setup.sh`, pero la task definition en producción todavía no se actualizó — falta `register-task-definition` + `update-service --force-new-deployment` manual (ver sección 5 arriba).
- [x] `s3-frontend-setup.sh` corrido — bucket `findash-frontend-7874505` (static website hosting, solo-lectura pública) ya existe.
- [x] `deploy-frontend.yml` creado (test → build → `aws s3 sync`, filtro `paths: ['frontend/**']`).
- [ ] Policy inline `findash-s3-frontend-deploy` aplicada al rol `findash-github-actions-deploy` — falta el `put-role-policy` manual (ver sección 6 arriba), sin esto el primer push a `frontend/` va a fallar con `AccessDenied`.
- [ ] Secreto `S3_FRONTEND_BUCKET` agregado al repositorio de GitHub (ver sección 6 arriba).

---

## Conexión ECS Fargate ↔ RDS

Mismo criterio que tenía documentado App Runner: como la instancia de RDS se creó públicamente accesible (trade-off deliberado de `aws-setup.sh`, ver el comentario en ese script), la tarea de ECS se conecta por **TCP normal con TLS**, exactamente el mismo tipo de conexión que Prisma ya usa en local — solo cambia el host y `sslmode`. El pivot de App Runner a ECS Fargate no cambió nada acá: ambos son simplemente cómputo containerizado hablándole a la misma RDS por la misma red pública.

| Entorno | Formato de `DATABASE_URL` |
|---|---|
| Local (docker-compose) | `postgresql://user:pass@postgres:5432/findash?schema=public` (TCP, host = nombre del servicio, sin TLS) |
| ECS Fargate + RDS | `postgresql://user:pass@findash-db.c3iyyk8209g1.us-east-2.rds.amazonaws.com:5432/findash?sslmode=require` (TCP, con TLS) |

`DATABASE_URL` llega a la tarea de ECS inyectada desde Secrets Manager vía el campo `secrets` (no `environment`) de la definición de contenedor en `ecs-setup.sh` — Prisma la lee vía `env("DATABASE_URL")` en [backend/prisma/schema.prisma](./backend/prisma/schema.prisma), exactamente igual que en local y que en el diseño original de GCP/App Runner: sin ningún cambio de código entre entornos, solo cambia el valor de la variable.
