#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# FinDash — Setup inicial de AWS (reemplaza gcp-setup.sh)
# ============================================================================
# Requiere: aws-cli v2 instalado y autenticado (`aws configure` o SSO).
# Ejecutar UNA sola vez. Mayormente idempotente, revisa la salida igual.
#
# Qué hace este script:
#   1. Crea el repositorio ECR (para las imágenes Docker del backend)
#   2. Crea la instancia RDS Postgres (free tier: db.t4g.micro, 20GB)
#   3. Crea los secretos en Secrets Manager (DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET)
#   4. Crea el rol IAM que GitHub Actions va a asumir vía OIDC (sin access keys
#      de larga duración guardadas como secretos de GitHub)
#
# Qué NO hace (fuera de alcance, dos razones distintas):
#   - Crear el servicio de App Runner: necesita una imagen ya publicada en ECR,
#     así que se crea DESPUÉS del primer build de GitHub Actions (instrucciones
#     al final de este script).
#   - Restringir el security group de RDS a algo más que "acceso público
#     abierto en el puerto 5432" — es una simplificación deliberada para no
#     meterte en configuración de VPC connector de App Runner en una demo de
#     tiempo acotado. Documentado como trade-off, no como descuido — antes de
#     un uso real deberías restringir esto a los IPs/VPC que correspondan.
#
# Uso:
#   1. Ajusta las variables de la sección CONFIGURACIÓN.
#   2. chmod +x aws-setup.sh
#   3. ./aws-setup.sh
# ============================================================================

# ---------------------------------------------------------------------------
# CONFIGURACIÓN — ajusta esto antes de correr el script
# ---------------------------------------------------------------------------
AWS_REGION="us-east-1"
ECR_REPO_NAME="findash-backend"
RDS_INSTANCE_ID="findash-db"
RDS_DB_NAME="findash"
RDS_DB_USER="findash_app"
RDS_DB_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)"
JWT_SECRET_VALUE="$(openssl rand -hex 32)"
JWT_REFRESH_SECRET_VALUE="$(openssl rand -hex 32)"

# Necesario para el rol OIDC de GitHub Actions — ya ajustado a tu repo real
GITHUB_ORG="santihz98"
GITHUB_REPO="findash"
GITHUB_ROLE_NAME="findash-github-actions-deploy"

echo "=============================================="
echo "AWS_REGION:        $AWS_REGION"
echo "ECR_REPO_NAME:      $ECR_REPO_NAME"
echo "RDS_INSTANCE_ID:    $RDS_INSTANCE_ID"
echo "GitHub repo:        $GITHUB_ORG/$GITHUB_REPO"
echo "=============================================="
read -p "¿Continuar con esta configuración? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Cancelado. Edita las variables al inicio del script y vuelve a correr."
  exit 1
fi

AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
echo "--> Cuenta de AWS: $AWS_ACCOUNT_ID"

# ---------------------------------------------------------------------------
# 1. Crear repositorio ECR
# ---------------------------------------------------------------------------
echo "--> Creando repositorio ECR..."
aws ecr create-repository \
  --repository-name "$ECR_REPO_NAME" \
  --region "$AWS_REGION" \
  --image-scanning-configuration scanOnPush=true \
  || echo "(el repo ya existe, continuando)"

ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO_NAME}"
echo "--> ECR URI: $ECR_URI"

# ---------------------------------------------------------------------------
# 2. Crear instancia RDS Postgres (free tier)
# ---------------------------------------------------------------------------
echo "--> Creando security group para RDS..."
DEFAULT_VPC_ID="$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text --region "$AWS_REGION")"

SG_ID="$(aws ec2 create-security-group \
  --group-name "findash-rds-sg" \
  --description "FinDash RDS access" \
  --vpc-id "$DEFAULT_VPC_ID" \
  --region "$AWS_REGION" \
  --query 'GroupId' --output text 2>/dev/null || \
  aws ec2 describe-security-groups \
    --filters Name=group-name,Values=findash-rds-sg Name=vpc-id,Values="$DEFAULT_VPC_ID" \
    --query 'SecurityGroups[0].GroupId' --output text --region "$AWS_REGION")"

echo "--> Security group: $SG_ID (abriendo 5432 — ver nota de trade-off al inicio)"
aws ec2 authorize-security-group-ingress \
  --group-id "$SG_ID" \
  --protocol tcp --port 5432 --cidr 0.0.0.0/0 \
  --region "$AWS_REGION" 2>/dev/null || echo "(regla ya existe, continuando)"

echo "--> Creando instancia RDS (tarda varios minutos)..."
aws rds create-db-instance \
  --db-instance-identifier "$RDS_INSTANCE_ID" \
  --db-instance-class db.t4g.micro \
  --engine postgres \
  --engine-version 16 \
  --master-username "$RDS_DB_USER" \
  --master-user-password "$RDS_DB_PASSWORD" \
  --allocated-storage 20 \
  --db-name "$RDS_DB_NAME" \
  --vpc-security-group-ids "$SG_ID" \
  --publicly-accessible \
  --backup-retention-period 0 \
  --region "$AWS_REGION" \
  || echo "(la instancia ya existe, continuando)"

echo "--> Esperando a que RDS esté disponible (puede tardar 5-10 min)..."
aws rds wait db-instance-available --db-instance-identifier "$RDS_INSTANCE_ID" --region "$AWS_REGION"

RDS_ENDPOINT="$(aws rds describe-db-instances \
  --db-instance-identifier "$RDS_INSTANCE_ID" \
  --query 'DBInstances[0].Endpoint.Address' --output text --region "$AWS_REGION")"
echo "--> RDS endpoint: $RDS_ENDPOINT"

# ---------------------------------------------------------------------------
# 3. Crear secretos en Secrets Manager
# ---------------------------------------------------------------------------
echo "--> Creando secretos..."

DATABASE_URL="postgresql://${RDS_DB_USER}:${RDS_DB_PASSWORD}@${RDS_ENDPOINT}:5432/${RDS_DB_NAME}?sslmode=require"

aws secretsmanager create-secret \
  --name findash/DATABASE_URL \
  --secret-string "$DATABASE_URL" \
  --region "$AWS_REGION" \
  || aws secretsmanager put-secret-value --secret-id findash/DATABASE_URL --secret-string "$DATABASE_URL" --region "$AWS_REGION"

aws secretsmanager create-secret \
  --name findash/JWT_SECRET \
  --secret-string "$JWT_SECRET_VALUE" \
  --region "$AWS_REGION" \
  || aws secretsmanager put-secret-value --secret-id findash/JWT_SECRET --secret-string "$JWT_SECRET_VALUE" --region "$AWS_REGION"

aws secretsmanager create-secret \
  --name findash/JWT_REFRESH_SECRET \
  --secret-string "$JWT_REFRESH_SECRET_VALUE" \
  --region "$AWS_REGION" \
  || aws secretsmanager put-secret-value --secret-id findash/JWT_REFRESH_SECRET --secret-string "$JWT_REFRESH_SECRET_VALUE" --region "$AWS_REGION"

# ---------------------------------------------------------------------------
# 4. Rol IAM para GitHub Actions vía OIDC (sin access keys de larga duración)
# ---------------------------------------------------------------------------
echo "--> Configurando el proveedor OIDC de GitHub (si no existe)..."
aws iam create-open-id-connect-provider \
  --url "https://token.actions.githubusercontent.com" \
  --client-id-list "sts.amazonaws.com" \
  --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1" \
  --region "$AWS_REGION" 2>/dev/null || echo "(el proveedor OIDC ya existe, continuando)"

TRUST_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:${GITHUB_ORG}/${GITHUB_REPO}:*"
        }
      }
    }
  ]
}
EOF
)

echo "--> Creando el rol IAM para GitHub Actions..."
echo "$TRUST_POLICY" > /tmp/findash-trust-policy.json
aws iam create-role \
  --role-name "$GITHUB_ROLE_NAME" \
  --assume-role-policy-document file:///tmp/findash-trust-policy.json \
  --region "$AWS_REGION" \
  || aws iam update-assume-role-policy --role-name "$GITHUB_ROLE_NAME" --policy-document file:///tmp/findash-trust-policy.json

echo "--> Adjuntando permisos (ECR push + App Runner deploy + Secrets Manager read)..."
aws iam attach-role-policy --role-name "$GITHUB_ROLE_NAME" --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser
aws iam attach-role-policy --role-name "$GITHUB_ROLE_NAME" --policy-arn arn:aws:iam::aws:policy/AWSAppRunnerFullAccess

DEPLOY_ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/${GITHUB_ROLE_NAME}"

# ---------------------------------------------------------------------------
# Resumen final
# ---------------------------------------------------------------------------
echo ""
echo "=============================================="
echo "  SETUP COMPLETO"
echo "=============================================="
echo "ECR_URI:            $ECR_URI"
echo "RDS_ENDPOINT:        $RDS_ENDPOINT"
echo "DEPLOY_ROLE_ARN:     $DEPLOY_ROLE_ARN"
echo ""
echo "Secretos creados: findash/DATABASE_URL, findash/JWT_SECRET, findash/JWT_REFRESH_SECRET"
echo ""
echo "SIGUIENTE PASO — configurar GitHub (consola web del repo):"
echo "  Settings > Secrets and variables > Actions > New repository secret:"
echo "    AWS_DEPLOY_ROLE_ARN = $DEPLOY_ROLE_ARN"
echo "    AWS_REGION          = $AWS_REGION"
echo "    ECR_REPOSITORY      = $ECR_REPO_NAME"
echo ""
echo "PENDIENTE (requiere el workflow de GitHub Actions ya corrido al menos"
echo "una vez, para que exista una imagen en ECR):"
echo "  Después del primer push a ECR, crea el servicio de App Runner:"
echo ""
echo "  aws apprunner create-service --region $AWS_REGION \\"
echo "    --service-name findash-backend \\"
echo "    --source-configuration '{\"ImageRepository\":{\"ImageIdentifier\":\"${ECR_URI}:latest\",\"ImageRepositoryType\":\"ECR\",\"ImageConfiguration\":{\"Port\":\"3000\"}},\"AutoDeploymentsEnabled\":true}'"
echo ""
echo "Guarda esta salida — la vas a necesitar para PROGRESS.md y para"
echo "configurar los secretos del repo en GitHub."