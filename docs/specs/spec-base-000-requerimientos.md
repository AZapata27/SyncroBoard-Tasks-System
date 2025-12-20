# 📋 SPEC-000: Master Requirements Document
## SyncroBoard Tasks System

**Versión:** 1.0.0
**Última Actualización:** 2025-12-20
**Estado:** Draft
**Autor:** Engineering Team

---

## 1. Visión General del Producto

### 1.1 Propósito
**SyncroBoard** es una plataforma empresarial de gestión de tareas y proyectos diseñada para equipos de desarrollo de software que requieren:
- Sincronización en tiempo real entre múltiples usuarios
- Alta escalabilidad y disponibilidad (>99.9%)
- Arquitectura distribuida y orientada a eventos
- Experiencia de usuario comparable a herramientas como JIRA o Linear

### 1.2 Alcance del Sistema
El sistema debe soportar:
- Gestión de múltiples proyectos y equipos
- Tableros Kanban con estados personalizables
- Asignación inteligente de tareas basada en carga de trabajo
- Notificaciones multi-canal (in-app, email, push)
- Autenticación híbrida (Google OAuth2 + credenciales locales)
- Sincronización en tiempo real vía WebSockets

### 1.3 Restricciones y Limitaciones
- **Rendimiento:** Latencia < 200ms para operaciones de lectura
- **Escalabilidad:** Soporte inicial para 10,000 usuarios concurrentes
- **Disponibilidad:** SLA de 99.9% en producción
- **Seguridad:** Cumplimiento con OWASP Top 10 y GDPR

---

## 2. Arquitectura del Sistema

### 2.1 Decisiones Arquitectónicas

| Decisión | Justificación |
|----------|---------------|
| **Microservicios** | Escalabilidad independiente, despliegue granular, aislamiento de fallos |
| **Monorepo (Nx)** | Gestión unificada de código, reutilización de librerías, refactoring atómico |
| **Event-Driven** | Desacoplamiento temporal, consistencia eventual, auditoría completa |
| **Database per Service** | Autonomía de datos, sin acoplamiento por esquema |
| **API Gateway Pattern** | Punto de entrada único, seguridad centralizada, agregación de respuestas |

### 2.2 Stack Tecnológico

#### Backend
- **Runtime:** Node.js 20 LTS
- **Framework:** NestJS 10.x (TypeScript)
- **Monorepo:** Nx 18.x
- **Message Broker:** Apache Kafka 3.x
- **Base de Datos:** PostgreSQL 15.x (una instancia por servicio)
- **Cache/Session:** Redis 7.x
- **ORM:** TypeORM 0.3.x
- **Validación:** class-validator + class-transformer
- **Testing:** Jest + Supertest

#### Frontend
- **Framework:** Next.js 14.x (App Router)
- **Language:** TypeScript 5.x
- **State Management:** TanStack Query (server) + Zustand (client)
- **UI Framework:** Tailwind CSS + Shadcn/UI
- **Real-time:** Socket.io-client 4.x
- **Drag & Drop:** @dnd-kit/core
- **Forms:** React Hook Form + Zod

#### Infraestructura
- **Containerización:** Docker 24.x + Docker Compose 2.x
- **Orquestación (futuro):** Kubernetes
- **CI/CD:** GitHub Actions
- **Monitoring (futuro):** Prometheus + Grafana
- **Logging (futuro):** ELK Stack

---

## 3. Microservicios y Responsabilidades

### 3.1 Inventario de Servicios

| Servicio | Puerto | Base de Datos | Responsabilidad Principal |
|----------|--------|---------------|---------------------------|
| **API Gateway** | 3000 | Redis (shared) | Enrutamiento, autenticación, rate limiting, WebSockets |
| **Auth Service** | 3001 | `syncro_auth_db` | Identity Management, JWT, RBAC, OAuth2 |
| **Ticket Service** | 3002 | `syncro_ticket_db` | Proyectos, tickets, estados, comentarios, tableros |
| **Assignment Service** | 3003 | `syncro_assign_db` | Carga de trabajo, asignación automática, disponibilidad |
| **Notification Service** | 3004 | N/A (stateless) | Consumidor de eventos, email, push notifications |

### 3.2 Matriz de Dependencias

```
Gateway → Auth (validación de tokens)
Gateway → Ticket (proxy de requests)
Gateway → Assignment (proxy de requests)

Ticket → Kafka → Assignment (ticket.created)
Assignment → Kafka → Ticket (ticket.assigned)
Auth → Kafka → Assignment (user.created)
[Todos] → Kafka → Notification (eventos de notificación)
```

---

## 4. Comunicación Entre Servicios

### 4.1 Comunicación Síncrona
- **Protocolo:** HTTP/REST o TCP (NestJS Microservices)
- **Uso:** Solo para operaciones que requieren respuesta inmediata
- **Ejemplo:** Gateway → Auth para validar token

### 4.2 Comunicación Asíncrona (Event-Driven)
- **Broker:** Apache Kafka
- **Patrón:** Pub/Sub con topics por dominio
- **Uso:** Operaciones que no requieren respuesta inmediata
- **Garantías:** At-least-once delivery

### 4.3 Eventos de Kafka (Contratos Críticos)

| Evento | Productor | Consumidor(es) | Payload |
|--------|-----------|----------------|---------|
| `user.created` | Auth | Assignment, Notification | `{ userId, email, firstName, lastName, role }` |
| `ticket.created` | Ticket | Assignment, Notification | `{ ticketId, projectId, reporterId, title, priority }` |
| `ticket.assigned` | Assignment | Ticket, Notification | `{ ticketId, assigneeId, assignedAt }` |
| `ticket.status.updated` | Ticket | Notification, Gateway | `{ ticketId, oldStatus, newStatus, updatedBy }` |
| `ticket.commented` | Ticket | Notification | `{ ticketId, commentId, authorId, content }` |

---

## 5. Patrones Arquitectónicos Aplicados

### 5.1 Transactional Outbox Pattern
**Problema:** Garantizar que un cambio en la DB y la publicación de un evento ocurran atómicamente.

**Solución:**
1. Dentro de una transacción de DB:
   - Guardar la entidad principal (ej: ticket)
   - Guardar el evento en tabla `outbox` (event_type, payload, status=PENDING)
2. Un proceso en background (Outbox Relay) lee eventos PENDING y los publica en Kafka
3. Marcar el evento como SENT después de confirmación de Kafka

**Implementación:** `libs/common/outbox`

### 5.2 API Gateway Pattern
**Responsabilidades:**
- Single entry point para todos los clientes
- Autenticación y autorización centralizada
- Rate limiting y throttling
- Agregación de respuestas (si es necesario)
- WebSocket server para real-time

### 5.3 Database per Service Pattern
**Ventajas:**
- Aislamiento total de datos
- Cada servicio puede elegir su tecnología de persistencia
- Cambios de esquema no afectan otros servicios

**Desventajas:**
- Joins entre servicios requieren lógica de aplicación
- Consistencia eventual (no transacciones ACID distribuidas)

### 5.4 Circuit Breaker Pattern (Futuro)
- Prevenir cascading failures
- Fallback a valores por defecto
- Implementación: `@nestjs/terminus` + custom decorator

---

## 6. Flujos de Consistencia Eventual

### 6.1 Flujo de Creación y Asignación de Ticket

```
1. Usuario crea ticket en UI
   ↓
2. Frontend → Gateway → Ticket Service
   ↓
3. Ticket Service guarda en DB con assignee_id=NULL
   ↓
4. Ticket Service guarda evento en tabla outbox
   ↓
5. Outbox Relay publica ticket.created a Kafka
   ↓
6. Assignment Service consume evento
   ↓
7. Assignment Service calcula mejor candidato
   ↓
8. Assignment Service publica ticket.assigned
   ↓
9. Ticket Service consume evento y actualiza assignee_id
   ↓
10. Gateway recibe notificación y emite WebSocket
   ↓
11. Frontend actualiza UI en tiempo real
```

**Tiempo esperado:** 50-200ms (end-to-end)

### 6.2 Flujo de Actualización de Estado

```
1. Usuario arrastra ticket en tablero Kanban
   ↓
2. Frontend actualiza UI optimistamente
   ↓
3. Frontend → Gateway → Ticket Service PATCH /tickets/:id/status
   ↓
4. Ticket Service valida transición de estado
   ↓
5. Ticket Service actualiza DB y publica ticket.status.updated
   ↓
6. Gateway consume evento vía Redis Pub/Sub
   ↓
7. Gateway emite WebSocket a sala del proyecto
   ↓
8. Otros usuarios ven el cambio en tiempo real
```

---

## 7. Requerimientos de Seguridad

### 7.1 Autenticación
- **JWT:** Access Token (15 min) + Refresh Token (7 días)
- **Algoritmo:** RS256 (firma asimétrica)
- **Storage:**
  - Access Token: HTTP-Only Cookie
  - Refresh Token: Redis con TTL

### 7.2 Autorización
- **Modelo:** RBAC (Role-Based Access Control)
- **Roles:** ADMIN, PROJECT_MANAGER, DEVELOPER, VIEWER
- **Implementación:** Guards de NestJS + decoradores custom

### 7.3 Comunicación Interna
- **Header injection:** Gateway inyecta `x-user-id` y `x-user-roles`
- **Red privada:** Microservicios no expuestos públicamente
- **Validación:** Cada servicio valida headers internos

### 7.4 Protección de Endpoints
- **Rate Limiting:** 100 req/min por usuario (Redis Throttler)
- **CORS:** Whitelist de dominios permitidos
- **Helmet:** Headers de seguridad HTTP
- **Input Validation:** DTOs con class-validator en todos los endpoints

---

## 8. Requerimientos No Funcionales

### 8.1 Performance
| Métrica | Target | Crítico |
|---------|--------|---------|
| Latencia de lectura (GET) | < 100ms | < 200ms |
| Latencia de escritura (POST/PATCH) | < 300ms | < 500ms |
| WebSocket latency | < 50ms | < 100ms |
| Throughput | 1000 req/s | 500 req/s |

### 8.2 Escalabilidad
- **Horizontal:** Todos los servicios deben ser stateless
- **Vertical:** Optimización de queries y uso de índices
- **Caching:** Redis para datos leídos frecuentemente

### 8.3 Disponibilidad
- **SLA:** 99.9% (8.76h downtime/año)
- **Health Checks:** Endpoint `/health` en todos los servicios
- **Graceful Shutdown:** Cerrar conexiones antes de terminar proceso

### 8.4 Observabilidad (Fase 2)
- **Logs:** Formato JSON estructurado con correlation IDs
- **Metrics:** Prometheus para métricas de aplicación
- **Traces:** OpenTelemetry para distributed tracing
- **Dashboards:** Grafana para visualización

---

## 9. Infraestructura de Desarrollo

### 9.1 Docker Compose Services
```yaml
- postgres (1 instancia, 3 databases)
- redis
- zookeeper
- kafka
- [microservicios cuando estén listos]
```

### 9.2 Variables de Entorno
Cada servicio debe soportar configuración vía:
- `.env` local
- Docker Compose environment
- Kubernetes ConfigMaps/Secrets (futuro)

### 9.3 Scripts de Inicialización
- `init-multiple-databases.sh`: Crear las 3 DBs en Postgres
- `kafka-topics-init.sh`: Crear topics de Kafka (futuro)

---

## 10. Estrategia de Testing

### 10.1 Niveles de Testing
| Tipo | Herramienta | Cobertura Mínima | Responsable |
|------|-------------|------------------|-------------|
| Unit Tests | Jest | 80% | Cada servicio |
| Integration Tests | Jest + Testcontainers | Endpoints críticos | Cada servicio |
| E2E Tests | Playwright | Flujos principales | Frontend |
| Contract Tests | Pact (futuro) | Eventos de Kafka | Shared |

### 10.2 Testing de Eventos
- **Producers:** Verificar que eventos se publican con payload correcto
- **Consumers:** Verificar que eventos se procesan correctamente
- **Schema Validation:** Validar estructura de eventos contra contratos

---

## 11. Roadmap de Implementación

### Phase 1: Foundation (Semanas 1-3)
- [ ] Setup de monorepo con Nx
- [ ] Docker Compose con infraestructura
- [ ] Libs compartidas (common, contracts)
- [ ] Auth Service (básico)
- [ ] API Gateway (básico)

### Phase 2: Core Features (Semanas 4-6)
- [ ] Ticket Service completo
- [ ] Assignment Service
- [ ] Notification Service (email)
- [ ] Frontend: Tablero Kanban
- [ ] WebSockets real-time

### Phase 3: Advanced Features (Semanas 7-9)
- [ ] Comentarios en tickets
- [ ] Filtros y búsqueda avanzada
- [ ] Reportes de productividad
- [ ] Notificaciones push
- [ ] Optimizaciones de performance

### Phase 4: Production Ready (Semanas 10-12)
- [ ] Monitoring y observabilidad
- [ ] CI/CD pipeline completo
- [ ] Load testing y optimización
- [ ] Documentación de API (Swagger)
- [ ] Deployment a staging/producción

---

## 12. Referencias y Recursos

### 12.1 Documentación Técnica
- [NestJS Docs](https://docs.nestjs.com)
- [Nx Monorepo Guide](https://nx.dev/getting-started/intro)
- [Kafka Documentation](https://kafka.apache.org/documentation/)
- [Next.js App Router](https://nextjs.org/docs/app)

### 12.2 Patrones y Arquitectura
- *Microservices Patterns* - Chris Richardson
- *Building Microservices* - Sam Newman
- *Domain-Driven Design* - Eric Evans

### 12.3 Specs Relacionadas
- `spec-base-001-base.md` - Decisiones de arquitectura detalladas
- `spec-base-002-diseño-monorepo.md` - Estructura de código
- `docs/specs/backend/*` - Especificaciones de cada servicio
- `docs/specs/devops/*` - CI/CD y Docker
- `docs/specs/frontend/*` - Arquitectura de frontend

---

**Aprobaciones:**

| Rol | Nombre | Firma | Fecha |
|-----|--------|-------|-------|
| Tech Lead | - | - | - |
| Architect | - | - | - |
| Product Owner | - | - | - |
