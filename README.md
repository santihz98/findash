# FinDash — Billetera Digital

Monorepo del proyecto FinDash. Ver [ARCHITECTURE.md](./ARCHITECTURE.md) para el diseño técnico completo y [PROGRESS.md](./PROGRESS.md) para el estado sesión a sesión.

```
.
├── backend/          # NestJS + Prisma (arquitectura hexagonal)
├── frontend/          # Angular (vacío, se inicializa en una sesión futura)
├── docker-compose.yml # Postgres + backend para desarrollo local
└── cloudbuild.yaml    # CI/CD: test → build → push → deploy (Cloud Run)
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

## Checklist de GCP (pasos manuales, una sola vez)

Estos pasos **no los ejecuta Claude Code** — son cambios en tu cuenta/proyecto de GCP y requieren tu autorización explícita. Ejecútalos en orden antes de la Sesión 9 (primer despliegue real a producción). Necesitas `gcloud` CLI autenticado (`gcloud auth login`) y un método de facturación habilitado en el proyecto.

### 1. Crear el proyecto de GCP

```bash
gcloud projects create findash-prod --name="FinDash"
gcloud config set project findash-prod
# Vincula el proyecto a una cuenta de facturación desde la consola:
# https://console.cloud.google.com/billing/linkedaccount?project=findash-prod
```

### 2. Habilitar las APIs necesarias

```bash
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com
```

### 3. Crear el repositorio de Artifact Registry

```bash
gcloud artifacts repositories create findash \
  --repository-format=docker \
  --location=us-central1 \
  --description="Imágenes del backend de FinDash"
```

> Si cambias la región o el nombre del repo, actualiza las substitutions `_REGION` / `_AR_REPO` en [cloudbuild.yaml](./cloudbuild.yaml) o en el trigger.

### 4. Crear la instancia de Cloud SQL (Postgres)

```bash
gcloud sql instances create findash-db \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --storage-size=10GB \
  --storage-auto-increase

# Crea la base de datos y el usuario de la app
gcloud sql databases create findash --instance=findash-db
gcloud sql users create findash_app \
  --instance=findash-db \
  --password="ELIGE_UNA_PASSWORD_SEGURA_AQUI"
```

Anota el `CONNECTION_NAME` de la instancia (formato `PROJECT_ID:REGION:INSTANCE_NAME`), lo necesitas en el paso 5 y en el deploy de Cloud Run:

```bash
gcloud sql instances describe findash-db --format="value(connectionName)"
```

### 5. Configurar Secret Manager con `DATABASE_URL`, `JWT_SECRET` y `JWT_REFRESH_SECRET`

Cloud Run se conecta a Cloud SQL vía **Unix socket** (Cloud SQL Auth Proxy integrado), no vía TCP/host — por eso el formato de la URL es distinto al de desarrollo local:

```bash
CONNECTION_NAME="findash-prod:us-central1:findash-db"   # el que anotaste en el paso 4

printf 'postgresql://findash_app:ELIGE_UNA_PASSWORD_SEGURA_AQUI@localhost/findash?host=/cloudsql/%s' "$CONNECTION_NAME" \
  | gcloud secrets create DATABASE_URL --data-file=-

# JWT_SECRET / JWT_REFRESH_SECRET (Sesión 2): dos secretos DISTINTOS, cada
# uno con `openssl rand -hex 32` — nunca reutilices los valores de ejemplo
# de backend/.env.example en producción.
openssl rand -hex 32 | gcloud secrets create JWT_SECRET --data-file=-
openssl rand -hex 32 | gcloud secrets create JWT_REFRESH_SECRET --data-file=-

# Dale acceso de lectura a los 3 secretos a la service account que usará
# Cloud Run (por defecto, la service account por compute del proyecto):
PROJECT_NUMBER=$(gcloud projects describe findash-prod --format="value(projectNumber)")
for SECRET in DATABASE_URL JWT_SECRET JWT_REFRESH_SECRET; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

> `cloudbuild.yaml` ya inyecta los 3 secretos en el deploy vía `--set-secrets`. Nunca pongas sus valores reales en el repo (ni en `.env`, ni en `cloudbuild.yaml`) — solo viven en Secret Manager. El backend falla al arrancar si `JWT_SECRET`/`JWT_REFRESH_SECRET` faltan (sin fallback hardcodeado, ver `TokenService`), así que si el deploy falla al iniciar el contenedor, revisa primero que estos dos secretos existan y tengan el binding de IAM correcto.

### 6. Dar permisos a la service account de Cloud Build

La service account que ejecuta los triggers necesita poder desplegar en Cloud Run, publicar en Artifact Registry, y actuar como usuario de la service account de Cloud Run:

```bash
PROJECT_NUMBER=$(gcloud projects describe findash-prod --format="value(projectNumber)")
CB_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

gcloud projects add-iam-policy-binding findash-prod \
  --member="serviceAccount:${CB_SA}" --role="roles/run.admin"
gcloud projects add-iam-policy-binding findash-prod \
  --member="serviceAccount:${CB_SA}" --role="roles/artifactregistry.writer"
gcloud projects add-iam-policy-binding findash-prod \
  --member="serviceAccount:${CB_SA}" --role="roles/iam.serviceAccountUser"
gcloud projects add-iam-policy-binding findash-prod \
  --member="serviceAccount:${CB_SA}" --role="roles/cloudsql.client"
```

### 7. Crear el trigger de Cloud Build conectado a GitHub

1. Sube este repositorio a GitHub si aún no está ahí.
2. Conecta el repositorio desde la consola: [console.cloud.google.com/cloud-build/triggers/connect](https://console.cloud.google.com/cloud-build/triggers/connect?project=findash-prod)
3. Crea el trigger:

```bash
gcloud builds triggers create github \
  --name="findash-backend-deploy" \
  --repo-name="TU_REPO_EN_GITHUB" \
  --repo-owner="TU_USUARIO_O_ORG" \
  --branch-pattern="^main$" \
  --build-config="cloudbuild.yaml"
```

4. Verifica/ajusta las substitutions del trigger si tu región, nombre de repo de Artifact Registry, instancia de Cloud SQL o nombre del secreto son distintos a los valores por defecto de `cloudbuild.yaml` (`_REGION`, `_AR_REPO`, `_SERVICE_NAME`, `_CLOUDSQL_INSTANCE`, `_DATABASE_URL_SECRET`).

### Checklist resumido

- [ ] Proyecto de GCP creado y con facturación habilitada
- [ ] APIs habilitadas (Cloud Run, Cloud SQL Admin, Artifact Registry, Cloud Build, Secret Manager)
- [ ] Repositorio de Artifact Registry creado
- [ ] Instancia de Cloud SQL (Postgres) creada, con base de datos y usuario de app
- [ ] Secretos `DATABASE_URL`, `JWT_SECRET` y `JWT_REFRESH_SECRET` creados en Secret Manager, con acceso para la service account de Cloud Run
- [ ] Permisos IAM otorgados a la service account de Cloud Build
- [ ] Repo conectado a GitHub y trigger de Cloud Build creado

---

## Conexión Cloud Run ↔ Cloud SQL

Cloud Run no se conecta a Cloud SQL por IP/TCP como en local — usa el **Cloud SQL Auth Proxy integrado** vía un socket Unix montado automáticamente cuando el servicio se despliega con `--add-cloudsql-instances`. `cloudbuild.yaml` ya incluye este flag en el paso `deploy`.

La diferencia clave está en el formato de `DATABASE_URL`:

| Entorno | Formato de `DATABASE_URL` |
|---|---|
| Local (docker-compose) | `postgresql://user:pass@postgres:5432/findash?schema=public` (TCP, host = nombre del servicio) |
| Cloud Run + Cloud SQL | `postgresql://user:pass@localhost/findash?host=/cloudsql/PROJECT:REGION:INSTANCE` (Unix socket) |

La variable de entorno que Cloud Run necesita es simplemente `DATABASE_URL` (inyectada desde Secret Manager, ver paso 5 del checklist) con ese segundo formato — Prisma la lee vía `env("DATABASE_URL")` en [backend/prisma/schema.prisma](./backend/prisma/schema.prisma), sin ningún cambio de código entre entornos.
