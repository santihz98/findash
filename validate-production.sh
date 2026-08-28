#!/usr/bin/env bash
# ============================================================================
# FinDash — Validación end-to-end completa contra producción (ECS)
# ============================================================================
# Uso: ./validate-production.sh <IP_PUBLICA>
# Ejemplo: ./validate-production.sh 3.15.45.200
# ============================================================================

set -uo pipefail  # sin -e: queremos seguir corriendo aunque un check falle

if [ -z "${1:-}" ]; then
  echo "Uso: $0 <IP_PUBLICA_DE_LA_TAREA>"
  exit 1
fi

BASE_URL="http://$1:3000"
PASS=0
FAIL=0

check() {
  local desc="$1"
  local expected="$2"
  local actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "✅ PASS — $desc"
    PASS=$((PASS+1))
  else
    echo "❌ FAIL — $desc (esperado: $expected, recibido: $actual)"
    FAIL=$((FAIL+1))
  fi
}

echo "=============================================="
echo "  Validando: $BASE_URL"
echo "=============================================="

# 1. Health check
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health")
check "GET /health responde 200" "200" "$HEALTH"

# 2. Swagger docs
DOCS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/docs-json")
check "GET /api/docs-json responde 200" "200" "$DOCS"

# 3. Login con los 4 usuarios del seed
ADMIN_LOGIN=$(curl -s -X POST "$BASE_URL/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@findash.dev","password":"Demo1234!"}')
ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | python3 -c "import json,sys;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)
check "Login ADMIN devuelve accessToken" "1" "$([ -n "$ADMIN_TOKEN" ] && echo 1 || echo 0)"

BASIC_LOGIN=$(curl -s -X POST "$BASE_URL/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"basic@findash.dev","password":"Demo1234!"}')
BASIC_TOKEN=$(echo "$BASIC_LOGIN" | python3 -c "import json,sys;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)
check "Login BASIC devuelve accessToken" "1" "$([ -n "$BASIC_TOKEN" ] && echo 1 || echo 0)"

# 4. Login inválido
BAD_LOGIN=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" -d '{"email":"admin@findash.dev","password":"incorrecta"}')
check "Login con password incorrecta responde 401" "401" "$BAD_LOGIN"

# 5. /auth/me
ME_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/auth/me" -H "Authorization: Bearer $ADMIN_TOKEN")
check "GET /auth/me (ADMIN) responde 200" "200" "$ME_CODE"

# 6. /auth/me sin token
ME_NOAUTH=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/auth/me")
check "GET /auth/me sin token responde 401" "401" "$ME_NOAUTH"

# 7. /accounts (ADMIN)
ACCOUNTS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/accounts" -H "Authorization: Bearer $ADMIN_TOKEN")
check "GET /accounts (ADMIN) responde 200" "200" "$ACCOUNTS_CODE"

# 8. /accounts (CLIENT) -> 403
ACCOUNTS_FORBIDDEN=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/accounts" -H "Authorization: Bearer $BASIC_TOKEN")
check "GET /accounts (CLIENT) responde 403" "403" "$ACCOUNTS_FORBIDDEN"

# 9. /accounts/me (CLIENT)
MYACCT_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/accounts/me" -H "Authorization: Bearer $BASIC_TOKEN")
check "GET /accounts/me (CLIENT) responde 200" "200" "$MYACCT_CODE"

# 10. Transferencia sin X-Idempotency-Key -> 400
PREMIUM_ID=$(curl -s "$BASE_URL/accounts" -H "Authorization: Bearer $ADMIN_TOKEN" \
  | python3 -c "import json,sys;d=json.load(sys.stdin)['data'];print([a['id'] for a in d if a['accountType']=='PREMIUM'][0])" 2>/dev/null)

NOIDEM_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/transactions/transfer" \
  -H "Authorization: Bearer $BASIC_TOKEN" -H "Content-Type: application/json" \
  -d "{\"destAccountId\":\"$PREMIUM_ID\",\"amount\":\"10\"}")
check "POST /transactions/transfer sin X-Idempotency-Key responde 400" "400" "$NOIDEM_CODE"

# 11. Transferencia real + idempotencia
# NOTA: RN-02 (anti-fraude simulado) hace que ~78% de los intentos
# individuales reciban 504 por diseño (delay aleatorio 1-10s, corte en 3s)
# — no es un bug, ver PROGRESS.md Sesión 6. Reintentamos con keys nuevas
# hasta 8 veces (probabilidad de fallar las 8 seguidas: ~0.78^8 ≈ 12%).
TX_ID=""
for i in $(seq 1 8); do
  IDEM_KEY=$(python3 -c "import uuid;print(uuid.uuid4())")
  TRANSFER_RESP=$(curl -s -X POST "$BASE_URL/transactions/transfer" \
    -H "Authorization: Bearer $BASIC_TOKEN" -H "Content-Type: application/json" \
    -H "X-Idempotency-Key: $IDEM_KEY" -d "{\"destAccountId\":\"$PREMIUM_ID\",\"amount\":\"10\"}")
  TX_ID=$(echo "$TRANSFER_RESP" | python3 -c "import json,sys;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
  if [ -n "$TX_ID" ]; then
    echo "   (transferencia exitosa en el intento $i/8 — RN-02 hizo timeout en los anteriores, esperado)"
    break
  fi
done
check "Transferencia real devuelve un id (con reintentos por RN-02)" "1" "$([ -n "$TX_ID" ] && echo 1 || echo 0)"

if [ -n "$TX_ID" ]; then
  RETRY_RESP=$(curl -s -X POST "$BASE_URL/transactions/transfer" \
    -H "Authorization: Bearer $BASIC_TOKEN" -H "Content-Type: application/json" \
    -H "X-Idempotency-Key: $IDEM_KEY" -d "{\"destAccountId\":\"$PREMIUM_ID\",\"amount\":\"10\"}")
  RETRY_ID=$(echo "$RETRY_RESP" | python3 -c "import json,sys;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
  check "Reenvío de la misma key devuelve el MISMO id" "$TX_ID" "$RETRY_ID"
fi

# 12. Dashboard KPIs (ADMIN)
KPIS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/dashboard/kpis" -H "Authorization: Bearer $ADMIN_TOKEN")
check "GET /dashboard/kpis (ADMIN) responde 200" "200" "$KPIS_CODE"

# 13. Dashboard KPIs (CLIENT) -> 403
KPIS_FORBIDDEN=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/dashboard/kpis" -H "Authorization: Bearer $BASIC_TOKEN")
check "GET /dashboard/kpis (CLIENT) responde 403" "403" "$KPIS_FORBIDDEN"

echo "=============================================="
echo "  Resultado: $PASS passed, $FAIL failed"
echo "=============================================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi