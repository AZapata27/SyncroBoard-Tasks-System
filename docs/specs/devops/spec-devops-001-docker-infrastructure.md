# 🐳 SPEC-DEVOPS-001: Docker & Infrastructure
## Containerization Strategy

**Versión:** 1.0.0
**Última Actualización:** 2025-12-20
**Estado:** Draft

---

## 1. Estrategia de Contenedorización

### 1.1 Objetivos
- **Build Once, Deploy Many:** Una sola imagen base para todos los microservicios
- **Optimización de Capas:** Maximizar cache de Docker
- **Seguridad:** Imágenes minimal (Alpine), usuarios no-root
- **Reproducibilidad:** Entornos idénticos en dev/staging/prod

---

## 2. Dockerfile Multietapa

### 2.1 Dockerfile Universal para Monorepo

```dockerfile
# ============================================
# STAGE 1: Dependencies
# ============================================
FROM node:20-alpine AS deps

WORKDIR /app

# Copiar solo archivos de dependencias
COPY package*.json ./
COPY nx.json ./
COPY tsconfig*.json ./

# Instalar dependencias (cacheable)
RUN npm ci --only=production=false

# ============================================
# STAGE 2: Builder
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar dependencias de la etapa anterior
COPY --from=deps /app/node_modules ./node_modules

# Copiar código fuente
COPY . .

# Argumento para especificar qué app compilar
ARG APP_NAME
ENV APP_NAME=${APP_NAME}

# Compilar solo el servicio específico
RUN npx nx build ${APP_NAME} --configuration=production

# ============================================
# STAGE 3: Production Dependencies
# ============================================
FROM node:20-alpine AS prod-deps

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar solo dependencias de producción
RUN npm ci --only=production && npm cache clean --force

# ============================================
# STAGE 4: Runner (Imagen Final)
# ============================================
FROM node:20-alpine AS runner

WORKDIR /app

# Crear usuario no privilegiado
RUN addgroup -S syncro && adduser -S syncro -G syncro

# Copiar dependencias de producción
COPY --from=prod-deps /app/node_modules ./node_modules

# Copiar artefacto compilado
ARG APP_NAME
COPY --from=builder /app/dist/apps/${APP_NAME} ./dist

# Cambiar ownership
RUN chown -R syncro:syncro /app

# Cambiar a usuario no-root
USER syncro

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:${PORT}/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Exponer puerto
EXPOSE ${PORT}

# Comando de inicio
CMD ["node", "dist/main.js"]
```

### 2.2 .dockerignore

```
# Dependencies
node_modules
npm-debug.log
yarn-error.log

# Build outputs
dist
build
.nx

# Git
.git
.gitignore

# IDE
.idea
.vscode
*.swp
*.swo

# Tests
coverage
*.spec.ts
*.test.ts
__tests__

# Environment
.env
.env.local
.env*.local

# OS
.DS_Store
Thumbs.db

# Docs
docs
README.md
```

---

## 3. Docker Compose (Desarrollo Local)

### 3.1 docker-compose.yml

```yaml
version: '3.9'

services:
  # ==========================================
  # INFRASTRUCTURE
  # ==========================================

  postgres:
    image: postgres:15-alpine
    container_name: syncro-postgres
    environment:
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: securepassword123
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init-databases.sh:/docker-entrypoint-initdb.d/init-databases.sh
    networks:
      - syncro-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U admin"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: syncro-redis
    ports:
      - "6379:6379"
    networks:
      - syncro-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  zookeeper:
    image: bitnami/zookeeper:latest
    container_name: syncro-zookeeper
    environment:
      - ALLOW_ANONYMOUS_LOGIN=yes
    networks:
      - syncro-network

  kafka:
    image: bitnami/kafka:latest
    container_name: syncro-kafka
    ports:
      - "9092:9092"
    environment:
      - KAFKA_CFG_ZOOKEEPER_CONNECT=zookeeper:2181
      - KAFKA_CFG_ADVERTISED_LISTENERS=PLAINTEXT://kafka:9092
      - ALLOW_PLAINTEXT_LISTENER=yes
    depends_on:
      - zookeeper
    networks:
      - syncro-network
    healthcheck:
      test: ["CMD-SHELL", "kafka-topics.sh --bootstrap-server localhost:9092 --list"]
      interval: 30s
      timeout: 10s
      retries: 5

  # ==========================================
  # MICROSERVICES (Commented for now)
  # ==========================================

  # auth-service:
  #   build:
  #     context: .
  #     dockerfile: ./Dockerfile
  #     args:
  #       APP_NAME: auth-service
  #   container_name: syncro-auth-service
  #   ports:
  #     - "3001:3001"
  #   environment:
  #     - NODE_ENV=production
  #     - PORT=3001
  #     - DATABASE_URL=postgresql://admin:securepassword123@postgres:5432/syncro_auth_db
  #     - REDIS_URL=redis://redis:6379
  #     - KAFKA_BROKERS=kafka:9092
  #     - KAFKA_GROUP_ID=auth-service-group
  #   depends_on:
  #     - postgres
  #     - redis
  #     - kafka
  #   networks:
  #     - syncro-network
  #   restart: unless-stopped

  # gateway:
  #   build:
  #     context: .
  #     dockerfile: ./Dockerfile
  #     args:
  #       APP_NAME: gateway
  #   container_name: syncro-gateway
  #   ports:
  #     - "3000:3000"
  #   environment:
  #     - NODE_ENV=production
  #     - PORT=3000
  #     - REDIS_URL=redis://redis:6379
  #     - KAFKA_BROKERS=kafka:9092
  #     - AUTH_SERVICE_HOST=auth-service
  #     - AUTH_SERVICE_PORT=3001
  #     - TICKET_SERVICE_HOST=ticket-service
  #     - TICKET_SERVICE_PORT=3002
  #   depends_on:
  #     - redis
  #     - kafka
  #     - auth-service
  #   networks:
  #     - syncro-network
  #   restart: unless-stopped

networks:
  syncro-network:
    driver: bridge

volumes:
  postgres_data:
```

### 3.2 scripts/init-databases.sh

```bash
#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    -- Create databases for each microservice
    CREATE DATABASE syncro_auth_db;
    CREATE DATABASE syncro_ticket_db;
    CREATE DATABASE syncro_assign_db;

    -- Grant permissions
    GRANT ALL PRIVILEGES ON DATABASE syncro_auth_db TO $POSTGRES_USER;
    GRANT ALL PRIVILEGES ON DATABASE syncro_ticket_db TO $POSTGRES_USER;
    GRANT ALL PRIVILEGES ON DATABASE syncro_assign_db TO $POSTGRES_USER;

    -- Log success
    \echo 'Databases created successfully!'
EOSQL
```

---

## 4. Comandos de Docker

### 4.1 Build Individual Service

```bash
# Build auth-service
docker build \
  --build-arg APP_NAME=auth-service \
  -t syncroboard/auth-service:latest \
  -f Dockerfile .

# Build con cache optimizado
docker build \
  --build-arg APP_NAME=auth-service \
  --cache-from syncroboard/auth-service:latest \
  -t syncroboard/auth-service:latest \
  -f Dockerfile .
```

### 4.2 Run con Docker Compose

```bash
# Levantar solo infraestructura
docker-compose up -d postgres redis zookeeper kafka

# Levantar todo
docker-compose up -d

# Ver logs
docker-compose logs -f auth-service

# Rebuild y restart
docker-compose up -d --build auth-service

# Limpiar todo
docker-compose down -v
```

### 4.3 Scripts Útiles (package.json)

```json
{
  "scripts": {
    "docker:infra": "docker-compose up -d postgres redis zookeeper kafka",
    "docker:build:auth": "docker build --build-arg APP_NAME=auth-service -t syncroboard/auth-service .",
    "docker:build:gateway": "docker build --build-arg APP_NAME=gateway -t syncroboard/gateway .",
    "docker:build:ticket": "docker build --build-arg APP_NAME=ticket-service -t syncroboard/ticket-service .",
    "docker:build:all": "npm run docker:build:auth && npm run docker:build:gateway && npm run docker:build:ticket",
    "docker:clean": "docker-compose down -v && docker system prune -af"
  }
}
```

---

## 5. Optimizaciones de Performance

### 5.1 Build Cache

```bash
# Usar BuildKit para mejor cache
export DOCKER_BUILDKIT=1

# Build con cache inline
docker build \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  -t syncroboard/auth-service:latest .
```

### 5.2 Multi-platform Build

```bash
# Para deploy en diferentes arquitecturas
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --build-arg APP_NAME=auth-service \
  -t syncroboard/auth-service:latest \
  --push .
```

---

## 6. Variables de Entorno

### 6.1 .env.example

```env
# Database
POSTGRES_USER=admin
POSTGRES_PASSWORD=securepassword123
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# Redis
REDIS_URL=redis://localhost:6379

# Kafka
KAFKA_BROKERS=localhost:9092

# Auth Service
AUTH_SERVICE_PORT=3001
AUTH_DATABASE_URL=postgresql://admin:securepassword123@localhost:5432/syncro_auth_db
JWT_PRIVATE_KEY=<base64-private-key>
JWT_PUBLIC_KEY=<base64-public-key>
GOOGLE_CLIENT_ID=<your-google-client-id>

# Gateway
GATEWAY_PORT=3000
FRONTEND_URL=http://localhost:3001

# Ticket Service
TICKET_SERVICE_PORT=3002
TICKET_DATABASE_URL=postgresql://admin:securepassword123@localhost:5432/syncro_ticket_db

# Assignment Service
ASSIGNMENT_SERVICE_PORT=3003
ASSIGNMENT_DATABASE_URL=postgresql://admin:securepassword123@localhost:5432/syncro_assign_db
```

---

## 7. Troubleshooting

### 7.1 Problemas Comunes

```bash
# Problema: Puerto ya en uso
# Solución: Cambiar puerto o matar proceso
lsof -ti:5432 | xargs kill -9

# Problema: Volumen corrupto
# Solución: Recrear volumen
docker-compose down -v
docker volume rm syncroboard_postgres_data

# Problema: Out of memory
# Solución: Aumentar límites de Docker Desktop
# Settings → Resources → Memory: 8GB+

# Problema: Network error entre contenedores
# Solución: Verificar que todos estén en la misma red
docker network inspect syncroboard_syncro-network
```

### 7.2 Health Checks

```bash
# Verificar estado de servicios
docker-compose ps

# Verificar logs de health check
docker inspect --format='{{json .State.Health}}' syncro-postgres | jq

# Ejecutar health check manual
docker exec syncro-postgres pg_isready -U admin
```

---

## 8. Security Best Practices

### 8.1 Checklist
- [x] Usuario no-root en containers
- [x] Imágenes Alpine (minimal)
- [x] No secrets en Dockerfile
- [x] .dockerignore configurado
- [x] Health checks implementados
- [x] Resource limits (futuro)

### 8.2 Scanning de Vulnerabilidades

```bash
# Usar Trivy para escanear imágenes
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image syncroboard/auth-service:latest

# Integrar en CI/CD (ver spec-devops-002)
```

---

## 9. Next Steps

### Phase 1 (Actual)
- [x] Dockerfile multietapa
- [x] Docker Compose para infraestructura
- [x] Scripts de inicialización

### Phase 2
- [ ] Docker Compose para microservicios
- [ ] Healthchecks avanzados
- [ ] Resource limits (CPU/Memory)

### Phase 3 (Kubernetes)
- [ ] Helm charts
- [ ] Kubernetes manifests
- [ ] Horizontal Pod Autoscaling

---

**Referencias:**
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Multi-stage Builds](https://docs.docker.com/build/building/multi-stage/)
- [Docker Compose](https://docs.docker.com/compose/)

---

**Changelog:**

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0.0 | 2025-12-20 | Especificación inicial |
