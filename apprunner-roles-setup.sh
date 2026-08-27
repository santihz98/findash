#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# FinDash — Roles de App Runner (complemento de aws-setup.sh)
# ============================================================================
# aws-setup.sh creó el rol para GitHub Actions (findash-github-actions-deploy)
# pero NO los dos roles que App Runner necesita para sí mismo. Sin este
# script, `aws apprunner create-service` falla al hacer pull de ECR, y aunque
# lograra crearse, el contenedor fallaría al arrancar por no poder leer
# JWT_SECRET/JWT_REFRESH_SECRET (fail-fast por diseño, ver PROGRESS.md
# Sesión 2).
#
# Corre esto UNA sola vez, después de aws-setup.sh y antes de crear el
# servicio de App Runner.
# ============================================================================

AWS_REGION="us-east-2"
AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

echo "--> Cuenta: $AWS_ACCOUNT_ID | Región: $AWS_REGION"

# ---------------------------------------------------------------------------
# 1. Access Role — permite a App Runner hacer pull de la imagen desde ECR
# ---------------------------------------------------------------------------
echo "--> Creando Access Role (pull de ECR)..."
cat > /tmp/apprunner-ecr-trust.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "build.apprunner.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
EOF

aws iam create-role \
  --role-name findash-apprunner-ecr-access \
  --assume-role-policy-document file:///tmp/apprunner-ecr-trust.json \
  --region "$AWS_REGION" \
  || echo "(el rol ya existe, continuando)"

aws iam attach-role-policy \
  --role-name findash-apprunner-ecr-access \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess

# ---------------------------------------------------------------------------
# 2. Instance Role — permite al contenedor EN RUNTIME leer los 3 secretos
# ---------------------------------------------------------------------------
echo "--> Creando Instance Role (lectura de Secrets Manager en runtime)..."
cat > /tmp/apprunner-instance-trust.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "tasks.apprunner.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
EOF

aws iam create-role \
  --role-name findash-apprunner-instance \
  --assume-role-policy-document file:///tmp/apprunner-instance-trust.json \
  --region "$AWS_REGION" \
  || echo "(el rol ya existe, continuando)"

cat > /tmp/apprunner-secrets-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "secretsmanager:GetSecretValue",
    "Resource": [
      "arn:aws:secretsmanager:${AWS_REGION}:${AWS_ACCOUNT_ID}:secret:findash/DATABASE_URL-*",
      "arn:aws:secretsmanager:${AWS_REGION}:${AWS_ACCOUNT_ID}:secret:findash/JWT_SECRET-*",
      "arn:aws:secretsmanager:${AWS_REGION}:${AWS_ACCOUNT_ID}:secret:findash/JWT_REFRESH_SECRET-*"
    ]
  }]
}
EOF

aws iam put-role-policy \
  --role-name findash-apprunner-instance \
  --policy-name findash-secrets-read \
  --policy-document file:///tmp/apprunner-secrets-policy.json

ACCESS_ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/findash-apprunner-ecr-access"
INSTANCE_ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/findash-apprunner-instance"

echo ""
echo "=============================================="
echo "  ROLES DE APP RUNNER LISTOS"
echo "=============================================="
echo "Access Role ARN:   $ACCESS_ROLE_ARN"
echo "Instance Role ARN: $INSTANCE_ROLE_ARN"
echo ""
echo "Guarda estos dos ARNs — la Sesión 8 los necesita para el comando"
echo "'aws apprunner create-service' completo (con AuthenticationConfiguration"
echo "e InstanceConfiguration apuntando a estos roles, más RuntimeEnvironment"
echo "Secrets mapeando DATABASE_URL/JWT_SECRET/JWT_REFRESH_SECRET a los ARNs"
echo "de Secrets Manager) — el comando que imprimió aws-setup.sh al final"
echo "estaba incompleto, le faltaba justamente esto."