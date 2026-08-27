# FinDash — Billetera Digital

Monorepo del proyecto FinDash. Ver [ARCHITECTURE.md](./ARCHITECTURE.md) para el diseño técnico completo y [PROGRESS.md](./PROGRESS.md) para el estado sesión a sesión.

```
.
├── backend/                       # NestJS + Prisma (arquitectura hexagonal)
├── frontend/                      # Angular (vacío, se inicializa en una sesión futura)
├── docker-compose.yml             # Postgres + backend para desarrollo local
├── .github/workflows/deploy.yml   # CI/CD activo: test → build → push a ECR (AWS ECS Fargate)
├── aws-setup.sh                   # Setup inicial de AWS (ECR, RDS, Secrets Manager, rol OIDC) — ya corrido
├── apprunner-roles-setup.sh       # Roles de App Runner (Access/Instance) — creados, sin uso (ver Sesión 9, PROGRESS.md)
├── ecs-setup.sh                   # Cluster/servicio ECS Fargate (reemplaza a App Runner) — ya corrido
└── infra/gcp/cloudbuild.yaml.bak  # Pipeline original de GCP — no usado (ver Sesión 8, PROGRESS.md)
```

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

Requiere la base sembrada (`npm run prisma:migrate:deploy && npm run prisma:seed`, o `npx prisma db seed` — ver [PROGRESS.md](./PROGRESS.md) para los 4 usuarios de demo). Password de todos: `Demo1234!`.

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

**Desde la Sesión 6 (RN-02, anti-fraude simulado):** antes de confirmar cualquier transferencia, el backend consulta un servicio anti-fraude simulado que demora aleatoriamente entre 1 y 10 segundos — si tarda más de 3s, la request corta con **504** (no se debita ni acredita nada) en vez de completarse. Con el delay uniforme en ese rango, alrededor del 78% de los intentos reales va a caer en 504 y el resto en 201 — es esperable, no un bug, ver PROGRESS.md Sesión 6. Repetir el mismo comando de abajo varias veces con una key nueva cada vez para ver ambos casos.

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

## Checklist de AWS (pasos manuales, ya ejecutados — deploy validado en producción)

**Pivot de GCP a AWS (Sesión 8):** la cuenta de facturación de GCP quedó bloqueada por el error `OR-CBAT-23`, sin resolución posible desde este lado — ver PROGRESS.md Sesión 8 para el detalle completo. El checklist de GCP original (Cloud Run + Cloud SQL + Artifact Registry + Cloud Build) queda documentado como anexo en [ARCHITECTURE.md sección 7](./ARCHITECTURE.md) y su pipeline en [infra/gcp/cloudbuild.yaml.bak](./infra/gcp/cloudbuild.yaml.bak), sin borrar — es evidencia real de trabajo hecho y de una decisión de arquitectura tomada bajo una restricción externa, no técnica.

**Segundo pivot, de App Runner a ECS Fargate (Sesión 9):** al intentar `aws apprunner create-service` (el comando que este mismo checklist documentaba en la Sesión 8), AWS respondió `SubscriptionRequiredException: The AWS Access Key Id needs a subscription for the service`. Causa confirmada: **App Runner dejó de aceptar clientes nuevos desde el 30 de abril de 2026** — la cuenta de AWS de este proyecto se creó el 27 de agosto de 2026, después de ese corte, así que nunca tuvo acceso al servicio, sin importar la configuración de roles/permisos (que sí estaba correcta). Es una restricción de producto de AWS, no un error de este proyecto — ver PROGRESS.md Sesión 9 para el detalle completo. Los dos roles de App Runner (`findash-apprunner-ecr-access`, `findash-apprunner-instance`, creados por [apprunner-roles-setup.sh](./apprunner-roles-setup.sh)) quedan sin usar — no se borraron porque no generan costo, pero **no forman parte del deploy activo**.

Todos los scripts de esta sección ya corrieron manualmente contra la cuenta de AWS real (`683342010199`, `us-east-2`) — los recursos de abajo ya existen y el backend está sirviendo tráfico real en producción.

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
- `apprunner-roles-setup.sh` (Sesión 8) creó los dos roles de App Runner — quedan documentados por completitud, pero el servicio que los habría usado nunca se pudo crear (ver el pivot de arriba).

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

Ya ejecutado en producción (Sesión 9): las 3 migraciones (`domain_model`, `add_user_document_number`, `audit_rejected_failed_transactions`) se aplicaron limpio contra la RDS real, y `prisma db seed` corrió sobre la misma base — los 4 usuarios de demo (`admin`/`basic`/`premium`/`corporate@findash.dev`) existen en producción.

### 3. Servicio ECS Fargate (ya creado — `ecs-setup.sh`, reemplaza al paso de App Runner)

A diferencia de App Runner (que este checklist documentaba hasta la Sesión 8), no hay un único comando `create-service` de una sola vez: [ecs-setup.sh](./ecs-setup.sh) crea el cluster, la task definition y el servicio juntos (ver el detalle de cada recurso en la tabla de arriba). Ya corrió contra la cuenta real.

**Diferencia importante respecto a App Runner — el redeploy no es automático:** App Runner, con `AutoDeploymentsEnabled=true`, vigilaba el tag `latest` de ECR y redesplegaba solo. ECS Fargate no tiene ese comportamiento — un push a `main` que actualiza `latest` en ECR **no** dispara un redeploy de la tarea por sí solo. Esto queda pendiente como el próximo paso del proyecto (Sesión 9.5, ver PROGRESS.md): agregar un step al workflow que corra `aws ecs update-service --cluster findash-cluster --service findash-backend-service --force-new-deployment` después del push a ECR. Hasta que ese step exista, un redeploy tras un cambio de código requiere correr ese comando a mano.

Obtené la IP pública actual de la tarea (puede cambiar si ECS la reemplaza — ver el trade-off documentado en `ecs-setup.sh` sobre no usar Load Balancer):

```bash
TASK_ARN=$(aws ecs list-tasks --cluster findash-cluster --service-name findash-backend-service --region us-east-2 --query 'taskArns[0]' --output text)
ENI_ID=$(aws ecs describe-tasks --cluster findash-cluster --tasks $TASK_ARN --region us-east-2 --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' --output text)
aws ec2 describe-network-interfaces --network-interface-ids $ENI_ID --region us-east-2 --query 'NetworkInterfaces[0].Association.PublicIp' --output text
```

Verificación real contra esa IP (Sesión 9):

```bash
curl http://<IP_PUBLICA>:3000/health
# → {"status":"ok","database":"connected"}
```

### Checklist resumido

- [x] `aws-setup.sh` corrido — ECR, RDS, Secrets Manager, rol OIDC de GitHub Actions.
- [x] `apprunner-roles-setup.sh` corrido — Access Role e Instance Role de App Runner (sin uso, ver el pivot arriba).
- [x] `ecs-setup.sh` corrido — cluster, task definition y servicio ECS Fargate.
- [x] 3 secretos configurados en GitHub (Settings > Secrets and variables > Actions).
- [x] Schema migrado contra la RDS real (`prisma migrate deploy` + `prisma db seed`).
- [x] Push a `main` → workflow corre y sube la imagen a ECR (verificado con `aws ecr describe-images`).
- [x] Servicio ECS alcanzó steady state (`runningCount: 1`, sin tareas caídas).
- [x] `/health` verificado con `curl` real contra la IP pública de la tarea.
- [ ] Step de `aws ecs update-service --force-new-deployment` agregado al workflow (Sesión 9.5, próximo paso — ver PROGRESS.md).

---

## Conexión ECS Fargate ↔ RDS

Mismo criterio que tenía documentado App Runner (Sesión 8): como la instancia de RDS se creó públicamente accesible (trade-off deliberado de `aws-setup.sh`, ver el comentario en ese script), la tarea de ECS se conecta por **TCP normal con TLS**, exactamente el mismo tipo de conexión que Prisma ya usa en local — solo cambia el host y `sslmode`. El pivot de App Runner a ECS Fargate no cambió nada acá: ambos son simplemente cómputo containerizado hablándole a la misma RDS por la misma red pública.

| Entorno | Formato de `DATABASE_URL` |
|---|---|
| Local (docker-compose) | `postgresql://user:pass@postgres:5432/findash?schema=public` (TCP, host = nombre del servicio, sin TLS) |
| ECS Fargate + RDS | `postgresql://user:pass@findash-db.c3iyyk8209g1.us-east-2.rds.amazonaws.com:5432/findash?sslmode=require` (TCP, con TLS) |

`DATABASE_URL` llega a la tarea de ECS inyectada desde Secrets Manager vía el campo `secrets` (no `environment`) de la definición de contenedor en `ecs-setup.sh` — Prisma la lee vía `env("DATABASE_URL")` en [backend/prisma/schema.prisma](./backend/prisma/schema.prisma), exactamente igual que en local y que en el diseño original de GCP/App Runner: sin ningún cambio de código entre entornos, solo cambia el valor de la variable.
