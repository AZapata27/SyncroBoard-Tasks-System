Para completar el ecosistema de **SyncroBoard Tasks System**, el frontend debe diseñarse no solo como una interfaz estética, sino como un **cliente reactivo** capaz de manejar flujos de datos asíncronos y actualizaciones en tiempo real mediante WebSockets.

Siguiendo el enfoque de **Spec-Driven Development**, aquí tienes el diseño detallado para la capa de presentación.

---

## 1. Stack Tecnológico Sugerido

Para mantener la coherencia con el monorepo de NestJS, lo ideal es integrar el frontend en el mismo workspace de **Nx**:

* **Framework:** **React** (App Router) para SEO y rendimiento.
* **Gestión de Estado:** **TanStack Query (React Query)** para el estado del servidor (cache de tickets) y **Zustand** para el estado local (UI, modales).
* **Estilos:** **Tailwind CSS** + **Shadcn/UI** para componentes rápidos y accesibles.
* **Drag & Drop:** **@dnd-kit** o **react-beautiful-dnd** para el tablero Kanban.
* **Comunicación:** **Socket.io-client** para la conexión bidireccional con el Gateway.

---

## 2. Arquitectura de la Interfaz (Componentes Clave)

### A. El Tablero Kanban (Board View)

Es el componente principal del `Ticket Service`.

* **Columnas Dinámicas:** Se renderizan según los estados definidos en la base de datos (`OPEN`, `IN_PROGRESS`, etc.).
* **Optimistic Updates:** Cuando un usuario mueve un ticket, la UI se actualiza instantáneamente antes de que el servidor confirme, mejorando la percepción de velocidad.

### B. Notificaciones "In-App" (Real-Time)

* **Toast Notifications:** Mensajes emergentes que aparecen cuando el `Notification Service` o el Gateway emiten un evento de `ticket.assigned` o `ticket.status.updated`.

---

## 3. Integración con WebSockets y Redis Pub/Sub

El frontend debe suscribirse a "salas" (rooms) para evitar recibir datos de proyectos que no está viendo el usuario.

1. **Suscripción:** Al entrar a un tablero, el cliente emite `joinProject({ projectId })`.
2. **Escucha:** El cliente queda a la escucha del evento `ticketUpdated`.
3. **Sincronización:** Si otro usuario mueve un ticket, el Gateway envía el evento, y el frontend actualiza la posición del ticket sin que el usuario actualice la página.

---

## 4. Flujo de Autenticación con Google

Para implementar el login con Google diseñado en el **Auth Service**:

1. **Google One Tap / Login Button:** El usuario se autentica con Google en el cliente.
2. **ID Token:** El cliente recibe un token de Google y lo envía a `POST /auth/google` en el Gateway.
3. **Persistencia:** El backend responde con un JWT propio de SyncroBoard. El frontend lo guarda en una cookie `HttpOnly` para seguridad contra XSS.

---

## 5. Diseño de Rutas y Vistas

| Ruta | Descripción | Microservicio Relacionado |
| --- | --- | --- |
| `/login` | Selección de método de entrada (Google/Local) | Auth Service |
| `/projects` | Listado de proyectos disponibles | Ticket Service |
| `/projects/:id/board` | Vista Kanban con WebSockets activos | Ticket Service / Gateway |
| `/profile` | Información de carga de trabajo y capacidad | Assignment Service |

---

## 6. Spec de Performance: "Cero Latencia"

* **Caching de Datos:** Uso de Redis en el backend para que el primer renderizado del tablero sea menor a 200ms.
* **Lazy Loading:** Las modales de detalles del ticket se cargan bajo demanda para reducir el bundle inicial.
* **Reconexión Exponencial:** Si el WebSocket se corta, el cliente intenta reconectarse automáticamente aumentando el tiempo de espera.
