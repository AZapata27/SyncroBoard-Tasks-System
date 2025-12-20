Para profundizar en el **Ticket Service**, debemos diseñar el núcleo transaccional de **SyncroBoard**. Este servicio es el que genera mayor volumen de datos y eventos, por lo que su diseño debe ser extremadamente eficiente y estar desacoplado del resto mediante Kafka.

Siguiendo el enfoque de **Spec-Driven Development**, aquí tienes el diseño detallado para la Fase 2.

---

## 1. Responsabilidades del Ticket Service

* **Gestión de Proyectos:** Definición de espacios de trabajo, claves de proyecto (ej. "SYNC") y miembros asociados.
* **Ciclo de Vida del Ticket:** CRUD completo de tickets, incluyendo estados dinámicos (Backlog, In Progress, Review, Done).
* **Gestión de Comentarios:** Hilos de discusión dentro de cada ticket.
* **Motor de Estados (State Machine):** Validar que un ticket solo pueda pasar de "Open" a "In Progress" y no directamente a "Done" si no cumple ciertas reglas.
* **Propagación de Eventos:** Notificar cambios críticos para que el `Notification Service` y el `Assignment Service` reaccionen.

---

## 2. Modelo de Datos (`syncro_ticket_db`)

En este servicio, la base de datos PostgreSQL debe reflejar la jerarquía de un gestor de tareas profesional.

* **Projects:** `id (UUID), name, key (string, unique), description, owner_id (UUID), created_at`.
* **Tickets:** * `id (UUID)`
* `project_id (FK)`
* `code (string)` (ej. SYNC-101)
* `title, description, priority (LOW, MEDIUM, HIGH, URGENT)`
* `status (ENUM: OPEN, IN_PROGRESS, REVIEW, DONE)`
* `reporter_id (UUID)` (Viene del Auth Service)
* `assignee_id (UUID, nullable)` (Sincronizado vía Kafka desde Assignment Service)


* **Comments:** `id, ticket_id (FK), user_id, content, created_at`.

---

## 3. Flujo de Eventos de Kafka (Contratos Críticos)

El Ticket Service es el principal **Productor** de eventos del sistema.

### A. Evento: `ticket.created`

* **Cuándo ocurre:** Al insertar un nuevo ticket en la DB.
* **Payload:** `{ ticketId, projectId, reporterId, title, priority }`.
* **Consumidor:** `Assignment Service` (para decidir quién lo resuelve) y `Notification Service` (para avisar al equipo).

### B. Evento: `ticket.status.updated`

* **Cuándo ocurre:** Al mover un ticket en el tablero.
* **Payload:** `{ ticketId, oldStatus, newStatus, updatedBy }`.
* **Consumidor:** `Notification Service` y el **Gateway** (vía Redis Pub/Sub) para actualizar la UI en tiempo real por WebSockets.

---

## 4. Diseño de la Lógica de Negocio (Order of Execution)

Para garantizar la integridad, implementaremos el servicio con estos patrones:

1. **Validación de Miembros:** Antes de crear un ticket, el servicio verifica si el `reporter_id` tiene acceso al `project_id`.
2. **Generación de Secuencia:** El código del ticket (ej. SYNC-1) debe ser autoincremental por proyecto.
3. **Atomicidad (Pattern Outbox):** * Se inicia una transacción de base de datos.
* Se guarda el Ticket.
* Se guarda el evento en una tabla llamada `outbox_events`.
* Un proceso secundario lee la tabla `outbox` y envía el mensaje a Kafka. Esto evita que, si Kafka falla, el ticket se cree pero nadie se entere.



---

## 5. Integración con Redis (Read Optimization)

Dado que los usuarios consultan el tablero (Board) constantemente, no atacaremos la base de datos en cada "refresh".

* **Caching de Tableros:** Al consultar los tickets de un proyecto, el resultado se guarda en **Redis** con una clave `project:tickets:{projectId}`.
* **Invalidación:** Cualquier cambio (`create`, `update`, `delete`) en un ticket de ese proyecto debe eliminar la clave de Redis para que la siguiente consulta traiga datos frescos.

---

## 6. Spec de API para Ticket Service

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `POST` | `/projects` | Crea un nuevo proyecto y define su KEY (ej. "JIRA"). |
| `POST` | `/projects/:id/tickets` | Crea un ticket dentro de un proyecto. |
| `PATCH` | `/tickets/:id/status` | Actualiza el estado del ticket y dispara el evento Kafka. |
| `GET` | `/projects/:id/board` | Retorna todos los tickets organizados por columnas (Cacheado en Redis). |



## 1. El Desafío: Desacoplamiento de Datos

En una arquitectura de microservicios, el `Ticket Service` es dueño de la entidad **Ticket**, pero el `Assignment Service` es dueño de la **Lógica de Disponibilidad**. El campo `assignee_id` en la tabla de tickets es una "referencia" que debe mantenerse actualizada sin llamadas HTTP directas que generen acoplamiento.

---

## 2. Flujo de Consistencia Eventual (Paso a Paso)

### Paso A: Creación e Intención (`Ticket Service`)

1. El usuario crea un ticket.
2. El servicio guarda el ticket en `syncro_ticket_db` con `assignee_id: NULL`.
3. Se publica el evento **`ticket.created`** en Kafka con el payload: `{ ticketId: "UUID", projectId: "UUID", priority: "HIGH" }`.

### Paso B: Lógica de Asignación (`Assignment Service`)

1. El `Assignment Service` consume el evento `ticket.created`.
2. Consulta su propia base de datos (`syncro_assign_db`) para ver quién tiene menos carga de trabajo o quién es el especialista.
3. Ejecuta la asignación y publica un nuevo evento en Kafka: **`ticket.assigned`**.
* **Payload:** `{ ticketId: "UUID", assigneeId: "USER_UUID", assignedAt: "ISO_DATE" }`.



### Paso C: Actualización de Referencia (`Ticket Service`)

1. El `Ticket Service` escucha el tópico `ticket.assigned`.
2. Al recibirlo, hace un `UPDATE` en su base de datos para llenar el campo `assignee_id` con el valor recibido.
3. **Real-time:** Emite un mensaje vía Redis/WebSockets al frontend para que el usuario vea quién fue asignado sin recargar la página.

---

## 3. Manejo de Fallos (Resiliencia)

¿Qué pasa si el `Assignment Service` falla o Kafka está lento?

* **Estado Pendiente:** El ticket nace como "Unassigned". La UI debe reflejar esto.
* **Reintentos:** Si el `Ticket Service` no puede procesar el mensaje `ticket.assigned` (por ejemplo, si la DB está bloqueada), Kafka reintentará la entrega según la política de configuración.
* **Dead Letter Queues (DLQ):** Si un mensaje de asignación falla repetidamente, se envía a una "cola de errores" para auditoría manual.

---

## 4. Contrato de la Librería Compartida (`libs/contracts`)

Debes definir estas interfaces para que ambos servicios hablen el mismo idioma:

```typescript
// libs/contracts/src/tickets/events.ts

export interface TicketCreatedEvent {
  ticketId: string;
  projectId: string;
  priority: string;
  timestamp: Date;
}

export interface TicketAssignedEvent {
  ticketId: string;
  assigneeId: string;
  assignedAt: Date;
}

```

---

## 5. Diseño del "Outbox Pattern" en el Ticket Service

Para asegurar que nunca perdamos un evento si la base de datos se guarda pero Kafka falla, implementaremos una tabla intermedia:

1. **Transaction Start.**
2. `INSERT INTO tickets (...)`.
3. `INSERT INTO outbox (event_type, payload) VALUES ('ticket.created', '{...}')`.
4. **Transaction Commit.**
5. Un **Relay Worker** (proceso en segundo plano) lee la tabla `outbox` y publica en Kafka.

---



Para completar el diseño de **SyncroBoard**, el **Notification Service** actuará como el orquestador de la comunicación externa, mientras que el **API Gateway** gestionará la persistencia de la conexión en tiempo real mediante **WebSockets** y **Redis Pub/Sub**.

Aquí tienes el diseño detallado para cerrar el ciclo de vida del ticket con una experiencia de usuario fluida.

---

## 1. Arquitectura de Tiempo Real (WebSockets + Redis)

En un entorno de microservicios, el desafío de los WebSockets es que el usuario está conectado al **Gateway**, pero el evento ocurre en el **Ticket Service**. Necesitamos un puente.

### El Flujo de "Broadcast":

1. **Evento en Kafka:** El `Ticket Service` emite `ticket.status.updated`.
2. **Consumidor en el Gateway:** El Gateway (o un microservicio dedicado a WS) escucha ese evento de Kafka.
3. **Redis Pub/Sub:** Si tienes múltiples instancias del Gateway, el evento se publica en **Redis** para que todas las instancias se enteren.
4. **Emisión al Socket:** El Gateway identifica a los usuarios conectados que pertenecen al `projectId` del ticket y emite el mensaje: `socket.to(projectId).emit('ticketUpdated', data)`.

---

## 2. Notification Service: El Consumidor Omnipresente

Este servicio no tiene una API REST propia; su lógica es 100% reactiva basada en los eventos de Kafka.

### Responsabilidades:

* **Agregación de Preferencias:** Consulta si el usuario prefiere notificaciones por Email, Push o ninguna.
* **Templates:** Transforma el JSON de Kafka en un mensaje legible (ej: "¡Hola! Se te ha asignado el ticket SYNC-101").
* **Email Gateway:** Conexión con servicios como SendGrid, Mailgun o Amazon SES.

### Eventos que consume:

* `ticket.assigned`: Envía alerta al nuevo responsable.
* `ticket.commented`: Notifica al reportero y al asignado sobre una nueva actualización.
* `user.created`: Envía el correo de bienvenida (proceso iniciado por el Auth Service).

---

## 3. Spec-003: Real-Time & Notifications

### Contrato de WebSocket (Gateway)

| Evento (Emit) | Payload | Descripción |
| --- | --- | --- |
| `joinProject` | `{ projectId: string }` | El cliente se suscribe a las actualizaciones de un tablero. |
| `ticketMoved` | `{ ticketId, newStatus, userId }` | Notifica a todos en el tablero que un ticket cambió de columna. |
| `userTyping` | `{ ticketId, userName }` | (Opcional) Indica quién está comentando en tiempo real. |

---

## 4. Estructura Final del Monorepo con WebSockets

Para implementar esto en tu estructura de NestJS:

```text
/syncroboard-tasks-system
├── apps/
│   ├── gateway/
│   │   ├── src/
│   │   │   ├── auth/           # Guard de WebSockets para validar JWT
│   │   │   └── events/         # Gateway de Socket.io y Redis Adapter
│   ├── notification-service/
│   │   ├── src/
│   │   │   ├── mailer/         # Integración con SMTP/API
│   │   │   └── consumers/      # Listeners de Kafka para tickets y usuarios

```

---

## 5. Resumen del Ecosistema SyncroBoard

Con esto, has diseñado un sistema donde:

1. **Auth Service** provisiona al usuario (vía Google).
2. **Ticket Service** gestiona la lógica de negocio y persiste en su propia DB.
3. **Assignment Service** equilibra la carga de trabajo asíncronamente.
4. **Kafka** actúa como el sistema nervioso, moviendo datos sin acoplar los servicios.
5. **Redis & WebSockets** mantienen la interfaz del usuario viva y sincronizada en tiempo real.

---
