#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# FinDash — ECS Fargate (reemplaza a App Runner)
# ============================================================================
# App Runner dejó de aceptar clientes nuevos desde el 30 de abril de 2026 —
# cualquier cuenta de AWS creada después de esa fecha recibe
# SubscriptionRequiredException al intentar crear un servicio. Este script
# reemplaza SOLO la capa de cómputo: ECR, RDS y los 3 secretos de
# Secrets Manager ya provisionados (aws-setup.sh) se reutilizan tal cual.
#
# A diferencia de App Runner, ECS Fargate no vigila el tag `latest` de ECR
# por sí solo — el redeploy en cada push requiere un step explícito en el
# workflow de GitHub Actions (`aws ecs update-service --force-new-deployment`),
# que se agrega en la Sesión 9.
#
# Este script:
#   1. Crea el rol de ejecución de tarea (pull de ECR + logs a CloudWatch)
#   2. Crea el rol de tarea (lectura de Secrets Manager en runtime)
#   3. Crea el grupo de logs de CloudWatch
#   4. Crea el cluster ECS
#   5. Crea el security group del servicio (abre el puerto 3000 a internet —
#      mismo criterio de simplificación que ya se documentó para RDS)
#   6. Registra la task definition (Fargate, imagen de ECR + 3 secretos)
#   7. Crea el servicio ECS en las subnets públicas de la VPC por defecto,
#      con IP pública asignada directamente (sin Load Balancer — más simple
#      para esta demo, con el trade-off documentado de que la IP puede
#      cambiar si la tarea se reemplaza; ver nota al final)
#
# Uso:
#   1. Ajusta las variables de la sección CONFIGURACIÓN si hace falta.
#   2. chmod +x ecs-setup.sh
#   3. ./ecs-setup.sh
# ============================================================================

AWS_REGION="us-east-2"
CLUSTER_NAME="findash-cluster"
SERVICE_NAME="findash-backend-service"
TASK_FAMILY="findash-backend"
ECR_REPO_NAME="findash-backend"
CONTAINER_PORT=3000

AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
echo "--> Cuenta: $AWS_ACCOUNT_ID | Región: $AWS_REGION"

# ---------------------------------------------------------------------------
# 1. Rol de ejecución de tarea — pull de ECR + logs a CloudWatch
# ---------------------------------------------------------------------------
echo "--> Creando Task Execution Role..."
cat > /tmp/ecs-execution-trust.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "ecs-tasks.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
EOF

aws iam create-role \
  --role-name findash-ecs-execution \
  --assume-role-policy-document file:///tmp/ecs-execution-trust.json \
  || echo "(el rol ya existe, continuando)"

aws iam attach-role-policy \
  --role-name findash-ecs-execution \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# Además del pull de ECR (ya cubierto por la policy de arriba), la execution
# role también necesita poder LEER los secretos para inyectarlos como env
# vars al arrancar el contenedor (distinto del pull de la imagen en sí).
cat > /tmp/ecs-execution-secrets-policy.json << EOF
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
  --role-name findash-ecs-execution \
  --policy-name findash-secrets-read \
  --policy-document file:///tmp/ecs-execution-secrets-policy.json

# ---------------------------------------------------------------------------
# 2. Rol de tarea — permisos que el CONTENEDOR usa en runtime (hoy, ninguno
#    adicional al arranque; se deja preparado por si el backend necesita
#    llamar a otro servicio de AWS en el futuro)
# ---------------------------------------------------------------------------
echo "--> Creando Task Role..."
aws iam create-role \
  --role-name findash-ecs-task \
  --assume-role-policy-document file:///tmp/ecs-execution-trust.json \
  || echo "(el rol ya existe, continuando)"

# ---------------------------------------------------------------------------
# 3. Grupo de logs de CloudWatch
# ---------------------------------------------------------------------------
echo "--> Creando grupo de logs..."
aws logs create-log-group --log-group-name "/ecs/${TASK_FAMILY}" --region "$AWS_REGION" \
  || echo "(el grupo de logs ya existe, continuando)"

# ---------------------------------------------------------------------------
# 4. Cluster ECS
# ---------------------------------------------------------------------------
echo "--> Creando cluster ECS..."
aws ecs create-cluster --cluster-name "$CLUSTER_NAME" --region "$AWS_REGION"

# ---------------------------------------------------------------------------
# 5. Security group del servicio (puerto 3000 abierto — mismo criterio que
#    ya se documentó para RDS: simplificación consciente para esta demo)
# ---------------------------------------------------------------------------
echo "--> Creando security group del servicio..."
DEFAULT_VPC_ID="$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text --region "$AWS_REGION")"

SG_ID="$(aws ec2 create-security-group \
  --group-name findash-ecs-sg \
  --description "FinDash ECS Fargate service" \
  --vpc-id "$DEFAULT_VPC_ID" \
  --region "$AWS_REGION" \
  --query 'GroupId' --output text 2>/dev/null || \
  aws ec2 describe-security-groups \
    --filters Name=group-name,Values=findash-ecs-sg Name=vpc-id,Values="$DEFAULT_VPC_ID" \
    --query 'SecurityGroups[0].GroupId' --output text --region "$AWS_REGION")"

aws ec2 authorize-security-group-ingress \
  --group-id "$SG_ID" \
  --protocol tcp --port "$CONTAINER_PORT" --cidr 0.0.0.0/0 \
  --region "$AWS_REGION" 2>/dev/null || echo "(regla ya existe, continuando)"

SUBNET_IDS="$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$DEFAULT_VPC_ID" "Name=default-for-az,Values=true" \
  --query 'Subnets[].SubnetId' --output text --region "$AWS_REGION" | tr '\t' ',')"

echo "--> Subnets públicas: $SUBNET_IDS"

# ---------------------------------------------------------------------------
# 6. Task definition
# ---------------------------------------------------------------------------
echo "--> Registrando task definition..."
cat > /tmp/findash-task-def.json << EOF
{
  "family": "${TASK_FAMILY}",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::${AWS_ACCOUNT_ID}:role/findash-ecs-execution",
  "taskRoleArn": "arn:aws:iam::${AWS_ACCOUNT_ID}:role/findash-ecs-task",
  "containerDefinitions": [
    {
      "name": "findash-backend",
      "image": "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO_NAME}:latest",
      "portMappings": [{ "containerPort": ${CONTAINER_PORT}, "protocol": "tcp" }],
      "essential": true,
      "environment": [
        { "name": "NODE_ENV", "value": "production" },
        { "name": "JWT_ACCESS_EXPIRES_IN", "value": "15m" },
        { "name": "JWT_REFRESH_EXPIRES_IN", "value": "7d" },
        { "name": "CORS_ORIGIN", "value": "http://localhost:4200,http://findash-frontend-7874505.s3-website.us-east-2.amazonaws.com" }
      ],
      "secrets": [
        { "name": "DATABASE_URL", "valueFrom": "arn:aws:secretsmanager:${AWS_REGION}:${AWS_ACCOUNT_ID}:secret:findash/DATABASE_URL" },
        { "name": "JWT_SECRET", "valueFrom": "arn:aws:secretsmanager:${AWS_REGION}:${AWS_ACCOUNT_ID}:secret:findash/JWT_SECRET" },
        { "name": "JWT_REFRESH_SECRET", "valueFrom": "arn:aws:secretsmanager:${AWS_REGION}:${AWS_ACCOUNT_ID}:secret:findash/JWT_REFRESH_SECRET" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/${TASK_FAMILY}",
          "awslogs-region": "${AWS_REGION}",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
EOF

aws ecs register-task-definition --cli-input-json file:///tmp/findash-task-def.json --region "$AWS_REGION"

# ---------------------------------------------------------------------------
# 7. Servicio ECS (1 tarea, IP pública directa, sin Load Balancer)
# ---------------------------------------------------------------------------
echo "--> Creando el servicio ECS..."
aws ecs create-service \
  --cluster "$CLUSTER_NAME" \
  --service-name "$SERVICE_NAME" \
  --task-definition "$TASK_FAMILY" \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_IDS],securityGroups=[$SG_ID],assignPublicIp=ENABLED}" \
  --region "$AWS_REGION"

echo ""
echo "=============================================="
echo "  SETUP COMPLETO — esperando a que la tarea arranque"
echo "=============================================="
echo "Cluster:  $CLUSTER_NAME"
echo "Servicio: $SERVICE_NAME"
echo ""
echo "IMPORTANTE — trade-off consciente: sin Load Balancer, la IP pública"
echo "de la tarea puede cambiar si ECS la reemplaza (ej. tras un deploy o"
echo "un fallo de health check). Para esta demo es aceptable; en un entorno"
echo "real correspondería un Application Load Balancer con DNS estable."
echo ""
echo "Para obtener la IP pública actual, una vez que la tarea esté RUNNING:"
echo ""
echo "  TASK_ARN=\$(aws ecs list-tasks --cluster $CLUSTER_NAME --service-name $SERVICE_NAME --region $AWS_REGION --query 'taskArns[0]' --output text)"
echo "  ENI_ID=\$(aws ecs describe-tasks --cluster $CLUSTER_NAME --tasks \$TASK_ARN --region $AWS_REGION --query 'tasks[0].attachments[0].details[?name==\`networkInterfaceId\`].value' --output text)"
echo "  aws ec2 describe-network-interfaces --network-interface-ids \$ENI_ID --region $AWS_REGION --query 'NetworkInterfaces[0].Association.PublicIp' --output text"