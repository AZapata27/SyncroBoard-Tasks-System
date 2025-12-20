Para profundizar en el **Assignment Service**, debemos diseñarlo como el cerebro que gestiona la capacidad humana del equipo. Mientras que el Ticket Service se enfoca en el "qué", este servicio se enfoca en el "quién" y "cuándo".

A continuación, el diseño detallado de la lógica de asignación inteligente y carga de trabajo bajo **Spec-Driven Development**.

---

## 1. Responsabilidades del Assignment Service

* **Gestión de Carga de Trabajo (Workload):** Monitoreo en tiempo real de cuántos tickets activos tiene cada usuario.
* **Algoritmo de Asignación Automática:** Lógica para encontrar al desarrollador más apto basándose en disponibilidad y capacidad.
* **Mantenimiento de Disponibilidad:** Registro de usuarios activos, vacaciones o estados de "No molestar".
* **Historial de Asignaciones:** Auditoría de quién ha trabajado en qué, útil para reportes de productividad.

---

## 2. Modelo de Datos (`syncro_assign_db`)

Este servicio necesita una estructura que priorice la rapidez de consulta de capacidad.

* **UserWorkload:**
* `user_id (UUID)` (Sincronizado vía Kafka desde Auth Service).
* `active_tickets_count (int)`: Contador denormalizado para búsqueda rápida.
* `max_capacity (int)`: Límite de tickets simultáneos (ej. 5).


* **Assignments:**
* `id, ticket_id, user_id, assigned_at, unassigned_at (nullable)`.


* **TeamAvailability:**
* `user_id, status (AVAILABLE, BUSY, AWAY), last_active_at`.



---

## 3. Algoritmo de "Inteligencia de Asignación"

Cuando llega el evento `ticket.created`, el servicio ejecuta lo siguiente:

1. **Filtrado de Candidatos:** Selecciona usuarios que pertenezcan al proyecto y tengan estado `AVAILABLE`.
2. **Cálculo de Capacidad:** De los candidatos, busca el `user_id` con el menor `active_tickets_count` que no supere su `max_capacity`.
3. **Selección y Bloqueo:**
* Incrementa el contador en `UserWorkload`.
* Registra la entrada en `Assignments`.


4. **Emisión del Contrato:** Publica `ticket.assigned` hacia Kafka.

---

## 4. Sincronización de Usuarios (Auth -> Assignment)

Para que el Assignment Service funcione, debe conocer a los usuarios. No los consulta vía HTTP, sino que replica la información necesaria:

* **Evento:** `user.created` (desde Auth Service).
* **Acción:** El Assignment Service crea una entrada en su tabla `UserWorkload` con capacidad inicial y contadores en cero.

---

## 5. Spec-004: Assignment Intelligence logic

### Estados de Ticket vs Carga de Trabajo

El servicio debe escuchar también cambios de estado desde el **Ticket Service** para liberar capacidad:

| Evento Kafka | Acción en Assignment Service |
| --- | --- |
| `ticket.created` | Evalúa y asigna; incrementa `active_tickets_count`. |
| `ticket.status.updated` (a DONE) | Decrementa `active_tickets_count` del usuario asignado. |
| `ticket.status.updated` (a OPEN) | Si se reabre un ticket, se vuelve a evaluar la carga. |

---

## 6. Real-time y Feedback en la Asignación

Para mejorar la experiencia en **SyncroBoard**, el flujo de tiempo real funciona así:

1. El usuario crea un ticket y lo ve aparecer como "Unassigned" instantáneamente vía WebSocket.
2. Milisegundos después, el **Assignment Service** procesa el evento y emite `ticket.assigned`.
3. El **API Gateway** recibe la asignación vía Kafka/Redis y actualiza el avatar del encargado en el ticket de forma animada en la pantalla de todos los usuarios.

**Siguiente Paso:**
Ahora que tenemos la lógica de tickets, auth y asignaciones, ¿te gustaría que diseñemos la **Estrategia de Monorepo con Nx** para compartir los `DTOs` y el `KafkaClient` entre estos tres servicios? Esto asegurará que un cambio en el evento `ticket.assigned` no rompa el sistema.