# 📚 SyncroBoard Technical Specifications
## Complete Architecture & Design Documentation

**Última Actualización:** 2025-12-20
**Estado:** Draft - Phase 1 (Foundation)

---

## 📋 Índice de Especificaciones

### 🎯 Base Specifications (Fundamentos)

| Spec ID | Documento | Descripción | Estado |
|---------|-----------|-------------|--------|
| SPEC-000 | [Master Requirements](./spec-base-000-requerimientos.md) | Visión general, arquitectura, stack tecnológico | ✅ Draft |
| SPEC-001 | [Architecture Decisions](./spec-base-001-base.md) | Decisiones arquitectónicas y patrones | ✅ Draft |
| SPEC-002 | [Monorepo Design](./spec-base-002-diseño-monorepo.md) | Estructura Nx, libs compartidas | ✅ Draft |

### 🔧 Backend Specifications

| Spec ID | Documento | Servicio | Puerto | DB | Estado |
|---------|-----------|----------|--------|-----|--------|
| BACKEND-001 | [Auth Service](./backend/spec-backend-001-auth-service.md) | Identity & Access Management | 3001 | syncro_auth_db | ✅ Draft |
| BACKEND-002 | [API Gateway](./backend/spec-backend-002-api-gateway.md) | Entry Point & WebSockets | 3000 | Redis | ✅ Draft |
| BACKEND-003 | [Ticket Service](./backend/spec-backend-003-ticket-service.md) | Project & Task Management | 3002 | syncro_ticket_db | ✅ Draft |
| BACKEND-004 | [Assignment Service](./backend/spec-backend-004-assignment-service.md) | Workload Distribution | 3003 | syncro_assign_db | ✅ Draft |
| BACKEND-005 | [Shared Libraries](./backend/spec-backend-005-shared-libraries.md) | libs/common & libs/contracts | N/A | N/A | ✅ Draft |
| BACKEND-006 | [Notification Service](./backend/spec-backend-006-notification-service.md) | Email & Push Notifications | 3004 | N/A | ✅ Draft |

### 🐳 DevOps Specifications

| Spec ID | Documento | Descripción | Estado |
|---------|-----------|-------------|--------|
| DEVOPS-001 | [Docker Infrastructure](./devops/spec-devops-001-docker-infrastructure.md) | Containerization & Docker Compose | ✅ Draft |
| DEVOPS-002 | [CI/CD Pipeline](./devops/spec-devops-002-ci-cd-pipeline.md) | GitHub Actions & Deployment | ✅ Draft |

### 🎨 Frontend Specifications

| Spec ID | Documento | Descripción | Estado |
|---------|-----------|-------------|--------|
| FRONTEND-001 | [Frontend Architecture](./frontend/spec-frontend-001-architecture.md) | Next.js 14, Kanban Board, Real-time | ✅ Draft |

---

## 🏗️ Arquitectura del Sistema

### Diagrama de Microservicios

```
                              ┌──────────────┐
                              │   Frontend   │
                              │  (Next.js)   │
                              │   Port 3001  │
                              └──────┬───────┘
                                     │ HTTP/WS
                                     ↓
┌─────────────────────────────────────────────────────────────┐
│                     API Gateway (Port 3000)                  │
│  ┌────────────┐  ┌──────────────┐  ┌───────────────────┐   │
│  │ Auth Guard │→│ Rate Limiter  │→│ WebSocket Server  │   │
│  └────────────┘  └──────────────┘  └───────────────────┘   │
└──────┬──────────────────┬─────────────────┬────────────┬───┘
       │                  │                 │            │
       ↓                  ↓                 ↓            ↓
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Auth Service │  │Ticket Service│  │Assignment Svc│  │Notification  │
│   Port 3001  │  │   Port 3002  │  │   Port 3003  │  │  Port 3004   │
│              │  │              │  │              │  │              │
│  PostgreSQL  │  │  PostgreSQL  │  │  PostgreSQL  │  │  (Stateless) │
│ syncro_auth  │  │syncro_ticket │  │syncro_assign │  │              │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │                 │
       └─────────────────┴─────────────────┴─────────────────┘
                         │
                         ↓
                  ┌─────────────┐
                  │    Kafka    │
                  │  (Message   │
                  │   Broker)   │
                  └─────────────┘
```

### Stack Tecnológico Completo

#### Backend
- **Runtime:** Node.js 20 LTS
- **Framework:** NestJS 10.x
- **Language:** TypeScript 5.x
- **Monorepo:** Nx 18.x
- **Message Broker:** Apache Kafka 3.x
- **Database:** PostgreSQL 15.x
- **Cache:** Redis 7.x
- **ORM:** TypeORM 0.3.x

#### Frontend
- **Framework:** Next.js 14 (App Router)
- **UI:** Tailwind CSS + Shadcn/UI
- **State:** TanStack Query + Zustand
- **Real-time:** Socket.io-client

#### DevOps
- **Containers:** Docker 24.x + Docker Compose
- **CI/CD:** GitHub Actions
- **Future:** Kubernetes + Helm

---

## 🔄 Flujos de Datos Críticos

### 1. Flujo de Autenticación

```
Usuario → Gateway → Auth Service → JWT generado
                ↓
        Redis (Refresh Token)
                ↓
        Kafka: user.created
                ↓
        Assignment Service (crear workload)
```

### 2. Flujo de Creación de Ticket

```
Usuario → Gateway → Ticket Service
                      ↓
                  DB: tickets (assignee_id=NULL)
                      ↓
                  Outbox: ticket.created
                      ↓
                  Kafka: ticket.created
                      ↓
              Assignment Service
                      ↓
             Cálculo de asignación
                      ↓
              Kafka: ticket.assigned
                      ↓
          Ticket Service (actualiza assignee_id)
                      ↓
          Gateway (WebSocket broadcast)
                      ↓
          Frontend (actualización real-time)
```

### 3. Flujo de Actualización de Estado

```
Usuario arrastra ticket en UI
         ↓
    Optimistic update (UI)
         ↓
Gateway → Ticket Service → DB update
         ↓
    Kafka: ticket.status.updated
         ↓
    ┌────────┴────────┐
    ↓                 ↓
Gateway          Notification
(WebSocket)      (Email si DONE)
    ↓
Frontend
(sincronizar otros usuarios)
```

---

## 📊 Base de Datos

### Bases de Datos por Servicio

| Base de Datos | Servicio | Tablas Principales | Tamaño Estimado |
|---------------|----------|--------------------|-----------------|
| `syncro_auth_db` | Auth Service | users, user_roles, outbox_events | ~100MB |
| `syncro_ticket_db` | Ticket Service | projects, tickets, comments, outbox_events | ~1GB |
| `syncro_assign_db` | Assignment Service | user_workload, assignments, project_members_cache | ~500MB |

### Esquema de Conexiones

```
Auth Service ──────→ syncro_auth_db (PostgreSQL)
Ticket Service ────→ syncro_ticket_db (PostgreSQL)
Assignment Service ─→ syncro_assign_db (PostgreSQL)
Gateway ────────────→ Redis (Session & Cache)
All Services ───────→ Kafka (Events)
```

---

## 🔐 Seguridad

### Autenticación
- JWT con RS256 (firma asimétrica)
- Access Token: 15 minutos
- Refresh Token: 7 días (Redis con TTL)
- Blacklist de tokens revocados

### Autorización
- RBAC: ADMIN, PROJECT_MANAGER, DEVELOPER, VIEWER
- Guards de NestJS en todos los endpoints
- Header injection `x-user-id` por Gateway

### Protección
- Rate Limiting: 100 req/min por usuario
- CORS whitelist
- Helmet.js headers
- Validación de input con class-validator
- Argon2 para passwords

---

## 📈 Métricas de Rendimiento

### Targets

| Métrica | Target | Crítico |
|---------|--------|---------|
| Latencia GET | < 100ms | < 200ms |
| Latencia POST/PATCH | < 300ms | < 500ms |
| WebSocket latency | < 50ms | < 100ms |
| Throughput | 1000 req/s | 500 req/s |
| Uptime SLA | 99.9% | 99% |

### Optimizaciones Aplicadas
- ✅ Redis caching (boards, user data)
- ✅ Database indexes (all foreign keys, search fields)
- ✅ Optimistic updates (frontend)
- ✅ Nx affected (CI/CD)
- ✅ Docker layer caching
- 🔜 Connection pooling
- 🔜 CDN para assets estáticos
- 🔜 Database read replicas

---

## 🧪 Estrategia de Testing

### Backend
- **Unit Tests:** 80% coverage mínimo (Jest)
- **Integration Tests:** Endpoints críticos (Jest + Testcontainers)
- **E2E Tests:** Flujos principales (Supertest)
- **Contract Tests:** Eventos de Kafka (Pact - futuro)

### Frontend
- **Unit Tests:** Componentes (Jest + React Testing Library)
- **Integration Tests:** Hooks y stores (Jest)
- **E2E Tests:** Flujos completos (Playwright)
- **Visual Regression:** Chromatic (futuro)

---

## 🚀 Roadmap de Implementación

### ✅ Phase 1: Foundation (Semanas 1-3)
- [x] Setup Nx monorepo
- [x] Docker Compose infraestructura
- [x] Specs completas
- [ ] Libs compartidas (common, contracts)
- [ ] Auth Service (MVP)
- [ ] API Gateway (MVP)

### 🔄 Phase 2: Core Features (Semanas 4-6)
- [ ] Ticket Service completo
- [ ] Assignment Service
- [ ] Notification Service (email)
- [ ] Frontend: Tablero Kanban
- [ ] WebSockets real-time

### 📋 Phase 3: Advanced Features (Semanas 7-9)
- [ ] Comentarios en tickets
- [ ] Filtros y búsqueda
- [ ] Reportes de productividad
- [ ] Notificaciones push
- [ ] Performance optimizations

### 🎯 Phase 4: Production Ready (Semanas 10-12)
- [ ] Monitoring (Prometheus + Grafana)
- [ ] CI/CD completo
- [ ] Load testing
- [ ] API Documentation (Swagger)
- [ ] Deployment a staging/producción

---

## 📚 Recursos y Referencias

### Documentación Oficial
- [NestJS Documentation](https://docs.nestjs.com)
- [Nx Monorepo Guide](https://nx.dev/getting-started/intro)
- [Next.js App Router](https://nextjs.org/docs/app)
- [Apache Kafka Docs](https://kafka.apache.org/documentation/)
- [TypeORM Guide](https://typeorm.io/)

### Libros Recomendados
- *Microservices Patterns* - Chris Richardson
- *Building Microservices* - Sam Newman
- *Domain-Driven Design* - Eric Evans
- *Designing Data-Intensive Applications* - Martin Kleppmann

### Arquitecturas de Referencia
- [Atlassian Jira Architecture](https://www.atlassian.com/blog/jira-software/jira-software-architecture)
- [Linear Engineering Blog](https://linear.app/blog/engineering)
- [Microservices.io Patterns](https://microservices.io/patterns/index.html)

---

## 🤝 Contribución

### Proceso de Actualización de Specs
1. Crear branch: `spec/update-<component-name>`
2. Actualizar markdown con cambios
3. Incrementar versión en header
4. Agregar entrada en Changelog
5. PR con revisión de Tech Lead

### Convenciones
- Usar tablas para datos estructurados
- Incluir ejemplos de código TypeScript
- Diagramas en ASCII art o Mermaid
- Referencias a otros specs usando links relativos

---

## 📝 Changelog General

| Fecha | Versión | Cambios |
|-------|---------|---------|
| 2025-12-20 | 1.0.0 | Especificaciones iniciales completas |

---

## 📧 Contacto

**Tech Lead:** [Nombre]
**Arquitecto:** [Nombre]
**Repositorio:** [URL del repo]

---

*Este documento es la fuente de verdad (Single Source of Truth) para el desarrollo de SyncroBoard. Todas las decisiones de arquitectura y diseño deben documentarse aquí antes de implementarse.*
