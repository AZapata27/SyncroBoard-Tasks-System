# ☁️ SPEC-INFRA-001: Infrastructure as Code (Terraform + AWS)
## Complete AWS Infrastructure with Terraform

**Versión:** 1.0.0
**Última Actualización:** 2025-12-20
**Estado:** Draft
**Cloud Provider:** AWS
**IaC Tool:** Terraform 1.6+

---

## 1. Arquitectura AWS Target

```
┌─────────────────────────────────────────────────────────┐
│                      Route 53 (DNS)                      │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│              CloudFront (CDN)                            │
│              - Frontend static assets                    │
│              - SSL/TLS termination                       │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│         Application Load Balancer (ALB)                  │
│         - HTTP/HTTPS routing                             │
│         - Health checks                                  │
└──┬────────────────┬─────────────────┬───────────────────┘
   │                │                 │
   │   ┌────────────▼──────────┐    │
   │   │   ECS Fargate          │    │
   │   │  ┌──────────────────┐  │    │
   │   │  │ Gateway          │  │    │
   │   │  │ Auth Service     │  │    │
   │   │  │ Ticket Service   │  │    │
   │   │  │ Assignment Svc   │  │    │
   │   │  │ Notification Svc │  │    │
   │   │  └──────────────────┘  │    │
   │   └─────────────────────────┘    │
   │                                  │
   │   ┌──────────────────────────┐   │
   │   │  RDS PostgreSQL          │   │
   │   │  - Multi-AZ              │   │
   │   │  - Automated backups     │   │
   │   └──────────────────────────┘   │
   │                                  │
   │   ┌──────────────────────────┐   │
   │   │  ElastiCache Redis       │   │
   │   │  - Cluster mode          │   │
   │   └──────────────────────────┘   │
   │                                  │
   └───┌──────────────────────────┐   │
       │  MSK (Managed Kafka)     │   │
       │  - Multi-broker cluster  │   │
       └──────────────────────────┘   │
                                      │
       ┌──────────────────────────┐   │
       │  S3 (Storage)            │   │
       │  - Backups               │   │
       │  - Logs                  │   │
       └──────────────────────────┘   │
                                      │
       ┌──────────────────────────┐   │
       │  CloudWatch              │   │
       │  - Logs                  │   │
       │  - Metrics               │   │
       │  - Alarms                │   │
       └──────────────────────────┘
```

---

## 2. Estructura de Terraform

```
infrastructure/
├── terraform/
│   ├── environments/
│   │   ├── dev/
│   │   │   ├── main.tf
│   │   │   ├── variables.tf
│   │   │   └── terraform.tfvars
│   │   ├── staging/
│   │   │   ├── main.tf
│   │   │   ├── variables.tf
│   │   │   └── terraform.tfvars
│   │   └── production/
│   │       ├── main.tf
│   │       ├── variables.tf
│   │       └── terraform.tfvars
│   │
│   └── modules/
│       ├── networking/
│       │   ├── main.tf
│       │   ├── variables.tf
│       │   └── outputs.tf
│       ├── ecs/
│       │   ├── main.tf
│       │   ├── variables.tf
│       │   └── outputs.tf
│       ├── rds/
│       │   ├── main.tf
│       │   ├── variables.tf
│       │   └── outputs.tf
│       ├── elasticache/
│       │   ├── main.tf
│       │   ├── variables.tf
│       │   └── outputs.tf
│       ├── msk/
│       │   ├── main.tf
│       │   ├── variables.tf
│       │   └── outputs.tf
│       ├── alb/
│       │   ├── main.tf
│       │   ├── variables.tf
│       │   └── outputs.tf
│       ├── cloudfront/
│       │   ├── main.tf
│       │   ├── variables.tf
│       │   └── outputs.tf
│       └── monitoring/
│           ├── main.tf
│           ├── variables.tf
│           └── outputs.tf
│
└── scripts/
    ├── deploy.sh
    ├── destroy.sh
    └── init-databases.sql
```

---

## 3. Terraform Modules

### 3.1 Networking Module

```hcl
# infrastructure/terraform/modules/networking/main.tf

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name        = "${var.project_name}-vpc-${var.environment}"
    Environment = var.environment
    Project     = var.project_name
  }
}

# Public Subnets
resource "aws_subnet" "public" {
  count                   = length(var.availability_zones)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, count.index)
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name        = "${var.project_name}-public-subnet-${count.index + 1}-${var.environment}"
    Environment = var.environment
    Type        = "public"
  }
}

# Private Subnets
resource "aws_subnet" "private" {
  count             = length(var.availability_zones)
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + length(var.availability_zones))
  availability_zone = var.availability_zones[count.index]

  tags = {
    Name        = "${var.project_name}-private-subnet-${count.index + 1}-${var.environment}"
    Environment = var.environment
    Type        = "private"
  }
}

# Internet Gateway
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name        = "${var.project_name}-igw-${var.environment}"
    Environment = var.environment
  }
}

# NAT Gateway
resource "aws_eip" "nat" {
  count  = length(var.availability_zones)
  domain = "vpc"

  tags = {
    Name        = "${var.project_name}-nat-eip-${count.index + 1}-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_nat_gateway" "main" {
  count         = length(var.availability_zones)
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = {
    Name        = "${var.project_name}-nat-${count.index + 1}-${var.environment}"
    Environment = var.environment
  }
}

# Route Tables
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name        = "${var.project_name}-public-rt-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_route_table" "private" {
  count  = length(var.availability_zones)
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[count.index].id
  }

  tags = {
    Name        = "${var.project_name}-private-rt-${count.index + 1}-${var.environment}"
    Environment = var.environment
  }
}

# Route Table Associations
resource "aws_route_table_association" "public" {
  count          = length(var.availability_zones)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count          = length(var.availability_zones)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# Security Groups
resource "aws_security_group" "alb" {
  name        = "${var.project_name}-alb-sg-${var.environment}"
  description = "Security group for Application Load Balancer"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.project_name}-alb-sg-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_security_group" "ecs_tasks" {
  name        = "${var.project_name}-ecs-tasks-sg-${var.environment}"
  description = "Security group for ECS tasks"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 0
    to_port         = 65535
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.project_name}-ecs-tasks-sg-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_security_group" "rds" {
  name        = "${var.project_name}-rds-sg-${var.environment}"
  description = "Security group for RDS"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  tags = {
    Name        = "${var.project_name}-rds-sg-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_security_group" "redis" {
  name        = "${var.project_name}-redis-sg-${var.environment}"
  description = "Security group for ElastiCache Redis"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  tags = {
    Name        = "${var.project_name}-redis-sg-${var.environment}"
    Environment = var.environment
  }
}
```

### 3.2 ECS Module

```hcl
# infrastructure/terraform/modules/ecs/main.tf

resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-cluster-${var.environment}"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name        = "${var.project_name}-cluster-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    base              = 1
    weight            = 100
    capacity_provider = "FARGATE"
  }
}

# Task Execution Role
resource "aws_iam_role" "ecs_task_execution_role" {
  name = "${var.project_name}-ecs-task-execution-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })

  tags = {
    Name        = "${var.project_name}-ecs-task-execution-role-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_policy" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Task Role
resource "aws_iam_role" "ecs_task_role" {
  name = "${var.project_name}-ecs-task-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })

  tags = {
    Name        = "${var.project_name}-ecs-task-role-${var.environment}"
    Environment = var.environment
  }
}

# CloudWatch Logs
resource "aws_cloudwatch_log_group" "ecs" {
  for_each = var.services

  name              = "/ecs/${var.project_name}-${each.key}-${var.environment}"
  retention_in_days = var.log_retention_days

  tags = {
    Name        = "${var.project_name}-${each.key}-logs-${var.environment}"
    Environment = var.environment
    Service     = each.key
  }
}

# Task Definitions
resource "aws_ecs_task_definition" "services" {
  for_each = var.services

  family                   = "${var.project_name}-${each.key}-${var.environment}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = each.value.cpu
  memory                   = each.value.memory
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([{
    name  = each.key
    image = "${var.ecr_repository_url}/${each.key}:${var.image_tag}"

    portMappings = [{
      containerPort = each.value.container_port
      protocol      = "tcp"
    }]

    environment = each.value.environment

    secrets = each.value.secrets

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.ecs[each.key].name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "curl -f http://localhost:${each.value.container_port}/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
  }])

  tags = {
    Name        = "${var.project_name}-${each.key}-task-${var.environment}"
    Environment = var.environment
    Service     = each.key
  }
}

# ECS Services
resource "aws_ecs_service" "services" {
  for_each = var.services

  name            = "${var.project_name}-${each.key}-${var.environment}"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.services[each.key].arn
  desired_count   = each.value.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.ecs_security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.target_group_arns[each.key]
    container_name   = each.key
    container_port   = each.value.container_port
  }

  deployment_configuration {
    maximum_percent         = 200
    minimum_healthy_percent = 100
  }

  depends_on = [var.alb_listener]

  tags = {
    Name        = "${var.project_name}-${each.key}-service-${var.environment}"
    Environment = var.environment
    Service     = each.key
  }
}

# Auto Scaling
resource "aws_appautoscaling_target" "ecs_target" {
  for_each = var.services

  max_capacity       = each.value.max_capacity
  min_capacity       = each.value.min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.services[each.key].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "ecs_policy_cpu" {
  for_each = var.services

  name               = "${var.project_name}-${each.key}-cpu-autoscaling-${var.environment}"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_target[each.key].resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_target[each.key].scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_target[each.key].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = 70.0
  }
}
```

### 3.3 RDS Module

```hcl
# infrastructure/terraform/modules/rds/main.tf

resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-db-subnet-group-${var.environment}"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name        = "${var.project_name}-db-subnet-group-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_db_parameter_group" "postgres" {
  name   = "${var.project_name}-postgres-params-${var.environment}"
  family = "postgres15"

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  parameter {
    name  = "log_duration"
    value = "1"
  }

  tags = {
    Name        = "${var.project_name}-postgres-params-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_db_instance" "postgres" {
  identifier     = "${var.project_name}-postgres-${var.environment}"
  engine         = "postgres"
  engine_version = "15.4"
  instance_class = var.instance_class

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.database_name
  username = var.master_username
  password = var.master_password

  db_subnet_group_name   = aws_db_subnet_group.main.name
  parameter_group_name   = aws_db_parameter_group.postgres.name
  vpc_security_group_ids = [var.rds_security_group_id]

  multi_az               = var.multi_az
  publicly_accessible    = false
  backup_retention_period = var.backup_retention_period
  backup_window          = "03:00-04:00"
  maintenance_window     = "Mon:04:00-Mon:05:00"

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  deletion_protection = var.deletion_protection
  skip_final_snapshot = !var.deletion_protection
  final_snapshot_identifier = var.deletion_protection ? "${var.project_name}-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}" : null

  tags = {
    Name        = "${var.project_name}-postgres-${var.environment}"
    Environment = var.environment
  }
}

# Read Replica (optional, for production)
resource "aws_db_instance" "postgres_replica" {
  count = var.create_read_replica ? 1 : 0

  identifier             = "${var.project_name}-postgres-replica-${var.environment}"
  replicate_source_db    = aws_db_instance.postgres.identifier
  instance_class         = var.instance_class
  publicly_accessible    = false
  skip_final_snapshot    = true
  vpc_security_group_ids = [var.rds_security_group_id]

  tags = {
    Name        = "${var.project_name}-postgres-replica-${var.environment}"
    Environment = var.environment
    Type        = "read-replica"
  }
}
```

---

## 4. Environment Configuration

### 4.1 Production Environment

```hcl
# infrastructure/terraform/environments/production/main.tf

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "syncroboard-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "syncroboard-terraform-lock"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "SyncroBoard"
      Environment = "production"
      ManagedBy   = "Terraform"
    }
  }
}

# Networking
module "networking" {
  source = "../../modules/networking"

  project_name       = var.project_name
  environment        = var.environment
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
}

# RDS
module "rds" {
  source = "../../modules/rds"

  project_name            = var.project_name
  environment             = var.environment
  instance_class          = "db.t3.medium"
  allocated_storage       = 100
  max_allocated_storage   = 500
  database_name           = "syncroboard"
  master_username         = var.db_master_username
  master_password         = var.db_master_password
  multi_az                = true
  backup_retention_period = 30
  deletion_protection     = true
  create_read_replica     = true

  private_subnet_ids     = module.networking.private_subnet_ids
  rds_security_group_id  = module.networking.rds_security_group_id
}

# ElastiCache Redis
module "elasticache" {
  source = "../../modules/elasticache"

  project_name          = var.project_name
  environment           = var.environment
  node_type             = "cache.t3.medium"
  num_cache_nodes       = 3
  port                  = 6379

  private_subnet_ids    = module.networking.private_subnet_ids
  redis_security_group_id = module.networking.redis_security_group_id
}

# MSK (Kafka)
module "msk" {
  source = "../../modules/msk"

  project_name     = var.project_name
  environment      = var.environment
  kafka_version    = "3.5.1"
  instance_type    = "kafka.t3.small"
  number_of_nodes  = 3
  ebs_volume_size  = 100

  private_subnet_ids = module.networking.private_subnet_ids
  vpc_id             = module.networking.vpc_id
}

# ALB
module "alb" {
  source = "../../modules/alb"

  project_name          = var.project_name
  environment           = var.environment
  vpc_id                = module.networking.vpc_id
  public_subnet_ids     = module.networking.public_subnet_ids
  alb_security_group_id = module.networking.alb_security_group_id
  certificate_arn       = var.certificate_arn
}

# ECS
module "ecs" {
  source = "../../modules/ecs"

  project_name           = var.project_name
  environment            = var.environment
  aws_region             = var.aws_region
  ecr_repository_url     = var.ecr_repository_url
  image_tag              = var.image_tag
  private_subnet_ids     = module.networking.private_subnet_ids
  ecs_security_group_id  = module.networking.ecs_security_group_id
  target_group_arns      = module.alb.target_group_arns
  alb_listener           = module.alb.listener

  services = {
    gateway = {
      cpu             = 512
      memory          = 1024
      container_port  = 3000
      desired_count   = 3
      min_capacity    = 2
      max_capacity    = 10
      environment     = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = "3000" }
      ]
      secrets = [
        { name = "JWT_PUBLIC_KEY", valueFrom = aws_secretsmanager_secret.jwt_public_key.arn }
      ]
    }
    auth-service = {
      cpu             = 256
      memory          = 512
      container_port  = 3001
      desired_count   = 2
      min_capacity    = 2
      max_capacity    = 8
      environment     = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = "3001" }
      ]
      secrets = [
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.db_url_auth.arn }
      ]
    }
    # ... otros servicios
  }
}

# Monitoring
module "monitoring" {
  source = "../../modules/monitoring"

  project_name = var.project_name
  environment  = var.environment
  sns_email    = var.alert_email
}
```

### 4.2 Variables

```hcl
# infrastructure/terraform/environments/production/variables.tf

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "syncroboard"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "db_master_username" {
  description = "Master username for RDS"
  type        = string
  sensitive   = true
}

variable "db_master_password" {
  description = "Master password for RDS"
  type        = string
  sensitive   = true
}

variable "certificate_arn" {
  description = "ARN of ACM certificate"
  type        = string
}

variable "alert_email" {
  description = "Email for CloudWatch alarms"
  type        = string
}
```

---

## 5. Deployment Scripts

### 5.1 Init & Deploy Script

```bash
#!/bin/bash
# infrastructure/scripts/deploy.sh

set -e

ENVIRONMENT=$1
ACTION=${2:-plan}

if [ -z "$ENVIRONMENT" ]; then
  echo "Usage: ./deploy.sh <environment> [plan|apply|destroy]"
  exit 1
fi

cd "terraform/environments/$ENVIRONMENT"

echo "🚀 Initializing Terraform..."
terraform init

echo "🔍 Validating configuration..."
terraform validate

if [ "$ACTION" == "plan" ]; then
  echo "📋 Creating execution plan..."
  terraform plan -out=tfplan
elif [ "$ACTION" == "apply" ]; then
  echo "✅ Applying changes..."
  terraform apply tfplan
elif [ "$ACTION" == "destroy" ]; then
  echo "⚠️  Destroying infrastructure..."
  terraform destroy
fi
```

---

## 6. Outputs

```hcl
# infrastructure/terraform/environments/production/outputs.tf

output "vpc_id" {
  description = "VPC ID"
  value       = module.networking.vpc_id
}

output "alb_dns_name" {
  description = "ALB DNS name"
  value       = module.alb.alb_dns_name
}

output "rds_endpoint" {
  description = "RDS endpoint"
  value       = module.rds.db_endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "Redis endpoint"
  value       = module.elasticache.redis_endpoint
  sensitive   = true
}

output "kafka_bootstrap_brokers" {
  description = "Kafka bootstrap brokers"
  value       = module.msk.bootstrap_brokers
  sensitive   = true
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = module.ecs.cluster_name
}
```

---

## 7. Cost Estimation

### 7.1 Monthly AWS Costs (Production)

| Servicio | Tipo | Cantidad | Costo Mensual (USD) |
|----------|------|----------|---------------------|
| ECS Fargate | 0.5 vCPU, 1GB RAM | 10 tasks | ~$150 |
| RDS PostgreSQL | db.t3.medium | 1 (Multi-AZ) | ~$140 |
| RDS Read Replica | db.t3.medium | 1 | ~$70 |
| ElastiCache Redis | cache.t3.medium | 3 nodes | ~$120 |
| MSK Kafka | kafka.t3.small | 3 brokers | ~$270 |
| ALB | - | 1 | ~$25 |
| NAT Gateway | - | 3 AZs | ~$100 |
| CloudWatch | Logs & Metrics | - | ~$50 |
| S3 | Backups | 100 GB | ~$3 |
| Data Transfer | - | 1 TB | ~$90 |
| **TOTAL** | | | **~$1,018/month** |

### 7.2 Development Environment (Reducido)

| Servicio | Tipo | Costo Mensual (USD) |
|----------|------|---------------------|
| ECS Fargate | Reduced | ~$50 |
| RDS | db.t3.micro | ~$20 |
| ElastiCache | cache.t3.micro | ~$15 |
| MSK | kafka.t3.small (1 broker) | ~$90 |
| ALB | - | ~$25 |
| NAT Gateway | 1 AZ | ~$35 |
| **TOTAL** | | **~$235/month** |

---

## 8. Next Steps

### Phase 1: Foundation
- [ ] Create S3 bucket for Terraform state
- [ ] Create DynamoDB table for state locking
- [ ] Setup AWS credentials & IAM roles
- [ ] Initialize Terraform modules

### Phase 2: Core Infrastructure
- [ ] Deploy VPC & networking
- [ ] Deploy RDS (all 3 databases)
- [ ] Deploy ElastiCache Redis
- [ ] Deploy MSK Kafka

### Phase 3: Application Layer
- [ ] Build & push Docker images to ECR
- [ ] Deploy ECS cluster & services
- [ ] Configure ALB & target groups
- [ ] Setup Route 53 DNS

### Phase 4: Monitoring & Security
- [ ] Configure CloudWatch alarms
- [ ] Setup AWS WAF on ALB
- [ ] Configure AWS Secrets Manager
- [ ] Enable CloudTrail audit logs

---

**Changelog:**

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0.0 | 2025-12-20 | Especificación inicial |
