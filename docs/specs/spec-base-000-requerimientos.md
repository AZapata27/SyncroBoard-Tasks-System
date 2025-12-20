# 📋 Master Specification: SyncroBoard Tasks System

## 1. Visión General

**SyncroBoard** es una plataforma de gestión de tareas de alto rendimiento basada en microservicios, diseñada para ofrecer una experiencia similar a JIRA con sincronización en tiempo real y arquitectura orientada a eventos.

---

## 2. Arquitectura de Software

* **Arquitectura:** Microservicios desacoplados.
* **Patrón de Comunicación:** Asíncrona mediante **Kafka** y síncrona/proxy vía **API Gateway**.
* **Gestión de Código:** Monorepo con **Nx**.
* **Persistencia:** Una base de datos PostgreSQL por microservicio para garantizar el aislamiento.
* **Estado y Real-time:** **Redis** para caché, lista negra de tokens y adaptador de WebSockets.

---

## 3. Microservicios y Responsabilidades

| Servicio                 | Responsabilidad Principal                                     | Base de Datos      |
|--------------------------|---------------------------------------------------------------|--------------------|
| **API Gateway**          | Entry point, Auth Guard, Rate Limiting, WebSocket Server.     | Redis (Cache)      |
| **Auth Service**         | Login (Google/Local), RBAC, JWT, Refresh Tokens.              | `syncro_auth_db`   |
| **Ticket Service**       | Gestión de proyectos, CRUD de tickets, estados y comentarios. | `syncro_ticket_db` |
| **Assignment Service**   | Inteligencia de carga de trabajo y asignación automática.     | `syncro_assign_db` |
| **Notification Service** | Consumidor de eventos para envío de correos y alertas push.   | N/A                |

---

## 4. Requerimientos Técnicos Globales

### Backend (NestJS Monorepo)

* **Librerías Compartidas:**
* `libs/common`: Configuración de Kafka, Redis, Decoradores e Interceptores.
* `libs/contracts`: Interfaces de eventos y DTOs compartidos.


* **Eventos de Kafka Críticos:**
* `user.created`: Disparado por Auth para provisionar perfil en Assignment.
* `ticket.created`: Disparado por Ticket para iniciar flujo de asignación.
* `ticket.assigned`: Disparado por Assignment para actualizar el Ticket Service.


* **Estrategia de Resiliencia:** Implementación del patrón **Transactional Outbox** para evitar pérdida de mensajes.

### Frontend (React/Next.js)

* **Estado Real-time:** Sincronización mediante WebSockets asociados a salas por `projectId`.
* **UI/UX:** Tablero Kanban con Drag & Drop y actualizaciones optimistas.
* **Auth:** Integración con Google OAuth2 mediante el flujo de backend.

---

## 5. Infraestructura y DevOps

* **Containerización:** Docker y Docker Compose para desarrollo local (Postgres, Kafka, Zookeeper, Redis).
* **Docker Build:** Dockerfile multietapa optimizado para monorepos.
* **CI/CD:** GitHub Actions utilizando `nx affected` para compilar solo lo que ha cambiado.
* **Seguridad:** * JWT de vida corta (15 min) + Refresh Tokens (7 días).
* Header `x-user-id` inyectado por el Gateway para comunicación interna segura.



---

## 6. Flujo de Consistencia Eventual

1. **Ticket Service** crea el registro y emite `ticket.created`.
2. **Assignment Service** calcula el responsable según carga de trabajo y emite `ticket.assigned`.
3. **Ticket Service** recibe el evento y actualiza el `assignee_id`.
4. **Gateway** notifica al cliente vía WebSockets sobre la nueva asignación.

---
