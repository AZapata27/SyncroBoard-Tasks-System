# 🚀 SPEC-DEVOPS-002: CI/CD Pipeline
## GitHub Actions & Deployment Strategy

**Versión:** 1.0.0
**Última Actualización:** 2025-12-20
**Estado:** Draft

---

## 1. Estrategia de CI/CD

### 1.1 Principios
- **Nx Affected:** Solo compilar y testear lo que cambió
- **Parallel Jobs:** Máximo paralelismo para velocidad
- **Fail Fast:** Detectar errores lo antes posible
- **Automated:** Deploy automático a staging, manual a producción

### 1.2 Pipeline Stages

```
┌─────────────┐
│ Push/PR     │
└──────┬──────┘
       │
       ↓
┌─────────────────────────────────┐
│ STAGE 1: Lint & Format          │
│ - ESLint                         │
│ - Prettier                       │
│ - Affected projects only         │
└──────┬──────────────────────────┘
       │
       ↓
┌─────────────────────────────────┐
│ STAGE 2: Test                    │
│ - Unit tests (Jest)              │
│ - Integration tests              │
│ - Affected projects only         │
└──────┬──────────────────────────┘
       │
       ↓
┌─────────────────────────────────┐
│ STAGE 3: Build                   │
│ - Build affected apps            │
│ - Type check                     │
│ - Bundle analysis                │
└──────┬──────────────────────────┘
       │
       ↓
┌─────────────────────────────────┐
│ STAGE 4: Security Scan           │
│ - Dependency audit               │
│ - Docker image scan (Trivy)      │
│ - SAST (Semgrep)                 │
└──────┬──────────────────────────┘
       │
       ↓
┌─────────────────────────────────┐
│ STAGE 5: Docker Build & Push     │
│ - Build images for affected apps │
│ - Push to registry               │
│ - Tag with commit SHA            │
└──────┬──────────────────────────┘
       │
       ↓
┌─────────────────────────────────┐
│ STAGE 6: Deploy (if main branch) │
│ - Staging: Automatic             │
│ - Production: Manual approval    │
└─────────────────────────────────┘
```

---

## 2. GitHub Actions Workflows

### 2.1 Main CI Workflow

```yaml
# .github/workflows/ci.yml

name: CI Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

env:
  NX_CLOUD_ACCESS_TOKEN: ${{ secrets.NX_CLOUD_ACCESS_TOKEN }}

jobs:
  setup:
    runs-on: ubuntu-latest
    outputs:
      has-changes: ${{ steps.check.outputs.has-changes }}
    steps:
      - name: Checkout
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

      - name: Check for changes
        id: check
        run: |
          echo "has-changes=$(npx nx affected:apps --base=origin/main --head=HEAD --plain | wc -l)" >> $GITHUB_OUTPUT

  lint:
    needs: setup
    if: needs.setup.outputs.has-changes != '0'
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
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

  test:
    needs: setup
    if: needs.setup.outputs.has-changes != '0'
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
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

      - name: Test affected projects
        run: npx nx affected --target=test --base=origin/main --head=HEAD --parallel=3 --coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        if: always()
        with:
          files: ./coverage/**/coverage-final.json
          flags: unittests

  build:
    needs: [lint, test]
    runs-on: ubuntu-latest
    strategy:
      matrix:
        app: [auth-service, gateway, ticket-service, assignment-service]
    steps:
      - name: Checkout
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

      - name: Build ${{ matrix.app }}
        run: npx nx build ${{ matrix.app }} --configuration=production

      - name: Upload build artifacts
        uses: actions/upload-artifact@v3
        with:
          name: ${{ matrix.app }}-build
          path: dist/apps/${{ matrix.app }}
          retention-days: 7

  security-scan:
    needs: setup
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Run npm audit
        run: npm audit --audit-level=high
        continue-on-error: true

      - name: Run Semgrep SAST
        uses: returntocorp/semgrep-action@v1
        with:
          config: >-
            p/typescript
            p/nodejs
            p/security-audit
        continue-on-error: true

  docker-build:
    needs: [build, security-scan]
    if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    strategy:
      matrix:
        app: [auth-service, gateway, ticket-service, assignment-service]
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ secrets.DOCKERHUB_USERNAME }}/syncro-${{ matrix.app }}
          tags: |
            type=ref,event=branch
            type=sha,prefix={{branch}}-
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./Dockerfile
          build-args: |
            APP_NAME=${{ matrix.app }}
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=registry,ref=${{ secrets.DOCKERHUB_USERNAME }}/syncro-${{ matrix.app }}:buildcache
          cache-to: type=registry,ref=${{ secrets.DOCKERHUB_USERNAME }}/syncro-${{ matrix.app }}:buildcache,mode=max

      - name: Scan Docker image
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ secrets.DOCKERHUB_USERNAME }}/syncro-${{ matrix.app }}:latest
          format: 'sarif'
          output: 'trivy-results.sarif'

      - name: Upload Trivy results to GitHub Security
        uses: github/codeql-action/upload-sarif@v2
        if: always()
        with:
          sarif_file: 'trivy-results.sarif'
```

---

### 2.2 Deployment Workflow

```yaml
# .github/workflows/deploy.yml

name: Deploy

on:
  workflow_run:
    workflows: ["CI Pipeline"]
    types:
      - completed
    branches: [main]

jobs:
  deploy-staging:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Deploy to staging
        run: |
          echo "Deploying to staging environment..."
          # TODO: Implement actual deployment
          # Options:
          # - Docker Compose SSH
          # - Kubernetes kubectl apply
          # - Terraform/Pulumi
          # - Cloud provider CLI (AWS ECS, GCP Cloud Run, etc.)

      - name: Run smoke tests
        run: |
          echo "Running smoke tests..."
          # curl http://staging.syncroboard.com/health

  deploy-production:
    needs: deploy-staging
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://syncroboard.com
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Deploy to production
        run: |
          echo "Deploying to production environment..."
          # Same as staging but with production credentials

      - name: Notify Slack
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "🚀 New version deployed to production!"
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

---

### 2.3 Database Migration Workflow

```yaml
# .github/workflows/db-migration.yml

name: Database Migration

on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment'
        required: true
        type: choice
        options:
          - staging
          - production
      service:
        description: 'Service'
        required: true
        type: choice
        options:
          - auth-service
          - ticket-service
          - assignment-service

jobs:
  migrate:
    runs-on: ubuntu-latest
    environment: ${{ github.event.inputs.environment }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm ci

      - name: Run migration
        env:
          DATABASE_URL: ${{ secrets[format('{0}_DATABASE_URL', github.event.inputs.service)] }}
        run: |
          cd apps/${{ github.event.inputs.service }}
          npm run migration:run

      - name: Verify migration
        run: |
          cd apps/${{ github.event.inputs.service }}
          npm run migration:show
```

---

## 3. Secrets Management

### 3.1 GitHub Secrets (Repository Level)

```
DOCKERHUB_USERNAME
DOCKERHUB_TOKEN
NX_CLOUD_ACCESS_TOKEN
CODECOV_TOKEN
SLACK_WEBHOOK

# Per Environment (staging, production)
AUTH_SERVICE_DATABASE_URL
TICKET_SERVICE_DATABASE_URL
ASSIGNMENT_SERVICE_DATABASE_URL
REDIS_URL
KAFKA_BROKERS
JWT_PRIVATE_KEY
JWT_PUBLIC_KEY
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
```

---

## 4. Branch Strategy

### 4.1 GitFlow Simplificado

```
main (production)
  ↑
  │ PR + Manual approval
  │
develop (staging)
  ↑
  │ PR + Auto-merge if CI passes
  │
feature/* (feature branches)
```

### 4.2 Reglas de Protección

```yaml
# Branch protection rules for main
- Require pull request reviews (1 approval)
- Require status checks to pass:
  - lint
  - test
  - build
  - security-scan
- Require branches to be up to date
- Require conversation resolution
- Restrict who can push (admins only)
```

---

## 5. Performance Optimizations

### 5.1 Nx Cloud

```bash
# Conectar con Nx Cloud para distributed caching
npx nx connect-to-nx-cloud

# En CI, los builds son hasta 10x más rápidos
# gracias al cache compartido entre runners
```

### 5.2 Action Caching

```yaml
- name: Cache node modules
  uses: actions/cache@v3
  with:
    path: ~/.npm
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-node-

- name: Cache Nx
  uses: actions/cache@v3
  with:
    path: .nx/cache
    key: ${{ runner.os }}-nx-${{ hashFiles('**/package-lock.json') }}
```

---

## 6. Monitoring & Notifications

### 6.1 Build Status Badge

```markdown
# README.md
![CI Pipeline](https://github.com/username/syncroboard/workflows/CI%20Pipeline/badge.svg)
[![Coverage](https://codecov.io/gh/username/syncroboard/branch/main/graph/badge.svg)](https://codecov.io/gh/username/syncroboard)
```

### 6.2 Slack Integration

```yaml
- name: Notify on failure
  if: failure()
  uses: slackapi/slack-github-action@v1
  with:
    payload: |
      {
        "text": "❌ Build failed on ${{ github.ref }}",
        "blocks": [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "Build failed\n*Repository:* ${{ github.repository }}\n*Branch:* ${{ github.ref }}\n*Author:* ${{ github.actor }}"
            }
          },
          {
            "type": "actions",
            "elements": [
              {
                "type": "button",
                "text": {"type": "plain_text", "text": "View Logs"},
                "url": "${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
              }
            ]
          }
        ]
      }
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

---

## 7. Cost Optimization

### 7.1 GitHub Actions Minutes

- **Free Tier:** 2,000 min/month (privado)
- **Optimización:**
  - Solo correr affected projects
  - Usar cache agresivamente
  - Paralelizar jobs

### 7.2 Self-Hosted Runners (Opcional)

```yaml
# Use self-hosted runner for heavy workloads
jobs:
  build:
    runs-on: [self-hosted, linux, x64]
```

---

## 8. Rollback Strategy

### 8.1 Tag-based Rollback

```bash
# Deploy specific version
docker pull syncroboard/auth-service:sha-abc123
docker tag syncroboard/auth-service:sha-abc123 syncroboard/auth-service:latest

# Or in Kubernetes
kubectl set image deployment/auth-service \
  auth-service=syncroboard/auth-service:sha-abc123
```

### 8.2 Database Rollback

```bash
# TypeORM migrations
npm run migration:revert

# Or manual
psql syncro_auth_db < backup_before_migration.sql
```

---

## 9. Testing in CI

### 9.1 Integration Tests con Testcontainers

```typescript
// apps/auth-service/test/integration/auth.e2e-spec.ts

describe('Auth E2E', () => {
  let postgresContainer: StartedTestContainer;
  let redisContainer: StartedTestContainer;

  beforeAll(async () => {
    postgresContainer = await new GenericContainer('postgres:15-alpine')
      .withEnvironment({ POSTGRES_PASSWORD: 'test' })
      .withExposedPorts(5432)
      .start();

    redisContainer = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .start();

    // Setup test app with containers
  });

  afterAll(async () => {
    await postgresContainer.stop();
    await redisContainer.stop();
  });

  // Tests...
});
```

---

## 10. Next Steps

### Phase 1 (Actual)
- [x] Basic CI pipeline
- [x] Docker build & push
- [x] Nx affected

### Phase 2
- [ ] E2E tests con Playwright
- [ ] Performance testing
- [ ] Automated rollback

### Phase 3
- [ ] Kubernetes deployment
- [ ] Canary deployments
- [ ] Feature flags

---

**Referencias:**
- [GitHub Actions Docs](https://docs.github.com/en/actions)
- [Nx CI Guide](https://nx.dev/recipes/ci/ci-setup)
- [Docker Build Best Practices](https://docs.docker.com/build/ci/)

---

**Changelog:**

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0.0 | 2025-12-20 | Especificación inicial |
