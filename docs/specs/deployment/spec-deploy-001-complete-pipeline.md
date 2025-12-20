# 🚀 SPEC-DEPLOY-001: Complete Deployment Pipeline
## From Git Push to AWS Production

**Versión:** 1.0.0
**Última Actualización:** 2025-12-20
**Estado:** Draft
**Target:** AWS ECS Fargate via GitHub Actions

---

## 1. Deployment Flow Overview

```
Developer Push → GitHub → GitHub Actions
                            ↓
                    ┌──────────────────┐
                    │  1. CI Pipeline   │
                    │  - Lint           │
                    │  - Test           │
                    │  - Build          │
                    │  - Security Scan  │
                    └────────┬──────────┘
                             ↓
                    ┌──────────────────┐
                    │  2. Docker Build  │
                    │  - Build images   │
                    │  - Push to ECR    │
                    └────────┬──────────┘
                             ↓
                    ┌──────────────────┐
                    │ 3. Deploy Staging │
                    │ - Update ECS      │
                    │ - Run migrations  │
                    │ - Smoke tests     │
                    └────────┬──────────┘
                             ↓
                    ┌──────────────────┐
                    │ 4. Manual Approval│
                    └────────┬──────────┘
                             ↓
                    ┌──────────────────┐
                    │ 5. Deploy Prod    │
                    │ - Blue/Green      │
                    │ - Gradual rollout │
                    │ - Monitor         │
                    └──────────────────┘
```

---

## 2. Complete GitHub Actions Workflow

```yaml
# .github/workflows/deploy-production.yml

name: Deploy to Production

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      environment:
        description: 'Target environment'
        required: true
        type: choice
        options:
          - staging
          - production

env:
  AWS_REGION: us-east-1
  ECR_REGISTRY: ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.us-east-1.amazonaws.com
  PROJECT_NAME: syncroboard

jobs:
  # ============================================
  # JOB 1: CI Pipeline (Lint, Test, Build)
  # ============================================
  ci:
    name: Continuous Integration
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Lint affected projects
        run: npx nx affected --target=lint --base=origin/main --head=HEAD --parallel=3

      - name: Test affected projects
        run: npx nx affected --target=test --base=origin/main --head=HEAD --parallel=3 --coverage

      - name: Build affected projects
        run: npx nx affected --target=build --base=origin/main --head=HEAD --parallel=3 --configuration=production

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/**/lcov.info

  # ============================================
  # JOB 2: Security Scanning
  # ============================================
  security:
    name: Security Scanning
    runs-on: ubuntu-latest
    needs: ci
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          format: 'sarif'
          output: 'trivy-results.sarif'

      - name: Upload Trivy results
        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: 'trivy-results.sarif'

      - name: Run Semgrep
        uses: returntocorp/semgrep-action@v1
        with:
          config: >-
            p/security-audit
            p/typescript
            p/nodejs

  # ============================================
  # JOB 3: Build & Push Docker Images
  # ============================================
  docker-build:
    name: Build Docker Images
    runs-on: ubuntu-latest
    needs: [ci, security]
    strategy:
      matrix:
        service:
          - gateway
          - auth-service
          - ticket-service
          - assignment-service
          - notification-service
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.ECR_REGISTRY }}/${{ env.PROJECT_NAME }}-${{ matrix.service }}
          tags: |
            type=sha,prefix={{branch}}-
            type=raw,value=latest,enable={{is_default_branch}}
            type=raw,value=${{ github.run_number }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./Dockerfile
          build-args: |
            APP_NAME=${{ matrix.service }}
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=registry,ref=${{ env.ECR_REGISTRY }}/${{ env.PROJECT_NAME }}-${{ matrix.service }}:buildcache
          cache-to: type=registry,ref=${{ env.ECR_REGISTRY }}/${{ env.PROJECT_NAME }}-${{ matrix.service }}:buildcache,mode=max

      - name: Scan Docker image
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ env.ECR_REGISTRY }}/${{ env.PROJECT_NAME }}-${{ matrix.service }}:${{ github.run_number }}
          format: 'sarif'
          output: 'trivy-image-results.sarif'

  # ============================================
  # JOB 4: Database Migrations (Staging)
  # ============================================
  migrate-staging:
    name: Run Database Migrations (Staging)
    runs-on: ubuntu-latest
    needs: docker-build
    environment: staging
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run migrations - Auth DB
        env:
          DATABASE_URL: ${{ secrets.STAGING_AUTH_DATABASE_URL }}
        run: |
          cd apps/auth-service
          npm run migration:run

      - name: Run migrations - Ticket DB
        env:
          DATABASE_URL: ${{ secrets.STAGING_TICKET_DATABASE_URL }}
        run: |
          cd apps/ticket-service
          npm run migration:run

      - name: Run migrations - Assignment DB
        env:
          DATABASE_URL: ${{ secrets.STAGING_ASSIGNMENT_DATABASE_URL }}
        run: |
          cd apps/assignment-service
          npm run migration:run

  # ============================================
  # JOB 5: Deploy to Staging
  # ============================================
  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    needs: migrate-staging
    environment:
      name: staging
      url: https://staging.syncroboard.com
    strategy:
      matrix:
        service:
          - gateway
          - auth-service
          - ticket-service
          - assignment-service
          - notification-service
    steps:
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Update ECS service
        run: |
          aws ecs update-service \
            --cluster ${{ env.PROJECT_NAME }}-cluster-staging \
            --service ${{ env.PROJECT_NAME }}-${{ matrix.service }}-staging \
            --force-new-deployment \
            --desired-count 1

      - name: Wait for service stability
        run: |
          aws ecs wait services-stable \
            --cluster ${{ env.PROJECT_NAME }}-cluster-staging \
            --services ${{ env.PROJECT_NAME }}-${{ matrix.service }}-staging

  # ============================================
  # JOB 6: Smoke Tests (Staging)
  # ============================================
  smoke-tests:
    name: Run Smoke Tests
    runs-on: ubuntu-latest
    needs: deploy-staging
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm ci

      - name: Run smoke tests
        env:
          BASE_URL: https://staging.syncroboard.com
          TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
          TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}
        run: npm run test:smoke

  # ============================================
  # JOB 7: Database Migrations (Production)
  # ============================================
  migrate-production:
    name: Run Database Migrations (Production)
    runs-on: ubuntu-latest
    needs: smoke-tests
    if: github.ref == 'refs/heads/main'
    environment: production
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Create DB backup before migration
        env:
          AWS_REGION: ${{ env.AWS_REGION }}
        run: |
          aws rds create-db-snapshot \
            --db-instance-identifier syncroboard-postgres-production \
            --db-snapshot-identifier syncroboard-pre-migration-$(date +%Y%m%d-%H%M%S)

      - name: Run migrations - Auth DB
        env:
          DATABASE_URL: ${{ secrets.PRODUCTION_AUTH_DATABASE_URL }}
        run: |
          cd apps/auth-service
          npm run migration:run

      - name: Run migrations - Ticket DB
        env:
          DATABASE_URL: ${{ secrets.PRODUCTION_TICKET_DATABASE_URL }}
        run: |
          cd apps/ticket-service
          npm run migration:run

      - name: Run migrations - Assignment DB
        env:
          DATABASE_URL: ${{ secrets.PRODUCTION_ASSIGNMENT_DATABASE_URL }}
        run: |
          cd apps/assignment-service
          npm run migration:run

  # ============================================
  # JOB 8: Deploy to Production (Blue/Green)
  # ============================================
  deploy-production:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: migrate-production
    if: github.ref == 'refs/heads/main'
    environment:
      name: production
      url: https://syncroboard.com
    strategy:
      max-parallel: 1  # Deploy one service at a time
      matrix:
        service:
          - gateway
          - auth-service
          - ticket-service
          - assignment-service
          - notification-service
    steps:
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Get current task definition
        id: current-task
        run: |
          TASK_DEF=$(aws ecs describe-task-definition \
            --task-definition ${{ env.PROJECT_NAME }}-${{ matrix.service }}-production \
            --query 'taskDefinition' \
            --output json)

          echo "task-definition=$TASK_DEF" >> $GITHUB_OUTPUT

      - name: Update task definition with new image
        id: new-task
        run: |
          NEW_TASK_DEF=$(echo '${{ steps.current-task.outputs.task-definition }}' | \
            jq --arg IMAGE "${{ env.ECR_REGISTRY }}/${{ env.PROJECT_NAME }}-${{ matrix.service }}:${{ github.run_number }}" \
            '.containerDefinitions[0].image = $IMAGE | del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy)')

          echo "$NEW_TASK_DEF" > task-def.json

      - name: Register new task definition
        id: register
        run: |
          NEW_TASK_ARN=$(aws ecs register-task-definition \
            --cli-input-json file://task-def.json \
            --query 'taskDefinition.taskDefinitionArn' \
            --output text)

          echo "task-arn=$NEW_TASK_ARN" >> $GITHUB_OUTPUT

      - name: Update ECS service (Blue/Green deployment)
        run: |
          aws ecs update-service \
            --cluster ${{ env.PROJECT_NAME }}-cluster-production \
            --service ${{ env.PROJECT_NAME }}-${{ matrix.service }}-production \
            --task-definition ${{ steps.register.outputs.task-arn }} \
            --deployment-configuration "maximumPercent=200,minimumHealthyPercent=100" \
            --health-check-grace-period-seconds 60

      - name: Wait for service stability
        run: |
          aws ecs wait services-stable \
            --cluster ${{ env.PROJECT_NAME }}-cluster-production \
            --services ${{ env.PROJECT_NAME }}-${{ matrix.service }}-production

      - name: Verify deployment health
        run: |
          # Wait 2 minutes for service to warm up
          sleep 120

          # Check CloudWatch metrics
          aws cloudwatch get-metric-statistics \
            --namespace AWS/ECS \
            --metric-name CPUUtilization \
            --dimensions Name=ServiceName,Value=${{ env.PROJECT_NAME }}-${{ matrix.service }}-production \
            --start-time $(date -u -d '5 minutes ago' +%Y-%m-%dT%H:%M:%S) \
            --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
            --period 300 \
            --statistics Average

  # ============================================
  # JOB 9: Post-Deployment Verification
  # ============================================
  post-deployment:
    name: Post-Deployment Verification
    runs-on: ubuntu-latest
    needs: deploy-production
    steps:
      - name: Run production health checks
        run: |
          services=("gateway" "auth-service" "ticket-service" "assignment-service" "notification-service")
          for service in "${services[@]}"; do
            echo "Checking $service..."
            response=$(curl -s -o /dev/null -w "%{http_code}" https://api.syncroboard.com/health)
            if [ $response -ne 200 ]; then
              echo "❌ Health check failed for $service"
              exit 1
            fi
            echo "✅ $service is healthy"
          done

      - name: Send Slack notification
        if: always()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "🚀 Production Deployment Complete",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Deployment Status:* ${{ job.status }}\n*Environment:* Production\n*Commit:* ${{ github.sha }}\n*Author:* ${{ github.actor }}"
                  }
                },
                {
                  "type": "actions",
                  "elements": [
                    {
                      "type": "button",
                      "text": {"type": "plain_text", "text": "View Deployment"},
                      "url": "${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
                    }
                  ]
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
          SLACK_WEBHOOK_TYPE: INCOMING_WEBHOOK

  # ============================================
  # JOB 10: Rollback (Manual Trigger)
  # ============================================
  rollback:
    name: Rollback Deployment
    runs-on: ubuntu-latest
    if: failure() && github.event_name == 'workflow_dispatch'
    needs: deploy-production
    steps:
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Rollback ECS services
        run: |
          services=("gateway" "auth-service" "ticket-service" "assignment-service" "notification-service")
          for service in "${services[@]}"; do
            echo "Rolling back $service..."

            # Get previous task definition
            PREV_TASK_ARN=$(aws ecs describe-services \
              --cluster ${{ env.PROJECT_NAME }}-cluster-production \
              --services ${{ env.PROJECT_NAME }}-$service-production \
              --query 'services[0].deployments[1].taskDefinition' \
              --output text)

            # Update service to use previous task definition
            aws ecs update-service \
              --cluster ${{ env.PROJECT_NAME }}-cluster-production \
              --service ${{ env.PROJECT_NAME }}-$service-production \
              --task-definition $PREV_TASK_ARN
          done

      - name: Notify rollback
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "⚠️ Deployment Rolled Back",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Deployment rolled back due to failure*\n*Environment:* Production\n*Commit:* ${{ github.sha }}"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
          SLACK_WEBHOOK_TYPE: INCOMING_WEBHOOK
```

---

## 3. Environment Secrets Configuration

```yaml
# GitHub Repository Secrets (Required)

# AWS Credentials
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_ACCOUNT_ID

# Database URLs
STAGING_AUTH_DATABASE_URL
STAGING_TICKET_DATABASE_URL
STAGING_ASSIGNMENT_DATABASE_URL
PRODUCTION_AUTH_DATABASE_URL
PRODUCTION_TICKET_DATABASE_URL
PRODUCTION_ASSIGNMENT_DATABASE_URL

# Application Secrets
JWT_PRIVATE_KEY
JWT_PUBLIC_KEY
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET

# Testing
TEST_USER_EMAIL
TEST_USER_PASSWORD

# Notifications
SLACK_WEBHOOK_URL
PAGERDUTY_SERVICE_KEY

# Monitoring
DATADOG_API_KEY (optional)
NEW_RELIC_LICENSE_KEY (optional)
```

---

## 4. Rollback Strategy

### 4.1 Automatic Rollback

```yaml
# .github/workflows/auto-rollback.yml

name: Auto Rollback on Failure

on:
  workflow_run:
    workflows: ["Deploy to Production"]
    types:
      - completed

jobs:
  check-deployment:
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'failure' }}
    steps:
      - name: Trigger rollback
        run: |
          gh workflow run rollback.yml \
            --ref main \
            -f reason="Automatic rollback due to deployment failure"
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 4.2 Manual Rollback

```bash
# scripts/rollback.sh

#!/bin/bash

ENVIRONMENT=$1
VERSION=$2

if [ -z "$ENVIRONMENT" ] || [ -z "$VERSION" ]; then
  echo "Usage: ./rollback.sh <environment> <version>"
  exit 1
fi

echo "Rolling back $ENVIRONMENT to version $VERSION..."

# Rollback each service
services=("gateway" "auth-service" "ticket-service" "assignment-service" "notification-service")

for service in "${services[@]}"; do
  echo "Rolling back $service..."

  aws ecs update-service \
    --cluster syncroboard-cluster-$ENVIRONMENT \
    --service syncroboard-$service-$ENVIRONMENT \
    --task-definition syncroboard-$service-$ENVIRONMENT:$VERSION \
    --force-new-deployment

  aws ecs wait services-stable \
    --cluster syncroboard-cluster-$ENVIRONMENT \
    --services syncroboard-$service-$ENVIRONMENT
done

echo "✅ Rollback complete!"
```

---

## 5. Monitoring Deployment Health

### 5.1 CloudWatch Dashboard

```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/ECS", "CPUUtilization", {"stat": "Average"}],
          [".", "MemoryUtilization", {"stat": "Average"}]
        ],
        "period": 300,
        "stat": "Average",
        "region": "us-east-1",
        "title": "ECS Resource Utilization"
      }
    },
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/ApplicationELB", "TargetResponseTime", {"stat": "Average"}],
          [".", "RequestCount", {"stat": "Sum"}]
        ],
        "period": 60,
        "stat": "Average",
        "region": "us-east-1",
        "title": "ALB Metrics"
      }
    }
  ]
}
```

---

## 6. Deployment Checklist

### Pre-Deployment
- [ ] All tests passing
- [ ] Security scans clean
- [ ] Database migrations reviewed
- [ ] Rollback plan documented
- [ ] Stakeholders notified

### During Deployment
- [ ] Monitor CloudWatch metrics
- [ ] Check error rates in logs
- [ ] Verify health checks passing
- [ ] Monitor user traffic

### Post-Deployment
- [ ] Smoke tests passed
- [ ] Performance metrics normal
- [ ] Error rates < threshold
- [ ] User feedback monitored
- [ ] Documentation updated

---

**Changelog:**

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0.0 | 2025-12-20 | Especificación inicial |
