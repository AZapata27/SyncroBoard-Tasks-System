# 🎯 SPEC-BACKEND-004: Assignment Service
## Intelligent Workload Distribution

**Versión:** 1.0.0
**Última Actualización:** 2025-12-20
**Estado:** Draft
**Dependencias:** `libs/common`, `libs/contracts`, PostgreSQL, Kafka
**Puerto:** 3003
**Base de Datos:** `syncro_assign_db`

---

## 1. Responsabilidades

1. **Algoritmo de Asignación:** Calcular el mejor usuario para un ticket
2. **Gestión de Carga:** Monitorear tickets activos por usuario
3. **Disponibilidad:** Gestionar estados de usuarios (AVAILABLE, BUSY, AWAY)
4. **Historial:** Auditoría de todas las asignaciones
5. **Sincronización:** Replicar datos de usuarios desde Auth Service

---

## 2. Modelo de Datos

```sql
-- User Workload (Replica desde Auth)
CREATE TABLE user_workload (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL,
  email VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  active_tickets_count INT DEFAULT 0,
  max_capacity INT DEFAULT 5,
  status VARCHAR(20) DEFAULT 'AVAILABLE',  -- AVAILABLE, BUSY, AWAY
  last_active_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Assignments History
CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL,
  user_id UUID REFERENCES user_workload(user_id),
  assigned_at TIMESTAMP DEFAULT NOW(),
  unassigned_at TIMESTAMP NULL,
  reason VARCHAR(50)  -- AUTO, MANUAL, REASSIGNED
);

-- Project Members Cache (Para filtrado rápido)
CREATE TABLE project_members_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  user_id UUID REFERENCES user_workload(user_id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

-- Indexes
CREATE INDEX idx_workload_status ON user_workload(status);
CREATE INDEX idx_workload_capacity ON user_workload(active_tickets_count);
CREATE INDEX idx_assignments_ticket ON assignments(ticket_id);
CREATE INDEX idx_assignments_user ON assignments(user_id);
CREATE INDEX idx_project_members_project ON project_members_cache(project_id);
```

---

## 3. Algoritmo de Asignación

### 3.1 Lógica de Selección

```typescript
async assignTicket(event: TicketCreatedEvent): Promise<string | null> {
  const { ticketId, projectId, priority } = event.payload;

  // 1. Obtener candidatos del proyecto
  const candidates = await this.userWorkloadRepository
    .createQueryBuilder('user')
    .innerJoin('project_members_cache', 'pm', 'pm.user_id = user.user_id')
    .where('pm.project_id = :projectId', { projectId })
    .andWhere('user.status = :status', { status: 'AVAILABLE' })
    .andWhere('user.active_tickets_count < user.max_capacity')
    .orderBy('user.active_tickets_count', 'ASC')
    .addOrderBy('user.last_active_at', 'DESC')
    .getMany();

  if (candidates.length === 0) {
    console.warn(`No available users for ticket ${ticketId}`);
    return null;
  }

  // 2. Seleccionar el usuario con menos carga
  const selectedUser = candidates[0];

  // 3. Incrementar contador
  await this.userWorkloadRepository.increment(
    { user_id: selectedUser.user_id },
    'active_tickets_count',
    1
  );

  // 4. Registrar asignación
  await this.assignmentsRepository.save({
    ticketId,
    userId: selectedUser.user_id,
    reason: 'AUTO',
  });

  return selectedUser.user_id;
}
```

### 3.2 Factores de Priorización (Fase 2)

```typescript
// Scoring con múltiples factores
function calculateScore(user: UserWorkload, ticket: TicketCreatedEvent) {
  let score = 0;

  // Factor 1: Carga actual (menor es mejor)
  score -= user.active_tickets_count * 10;

  // Factor 2: Especialización (si tiene historial en el proyecto)
  const expertise = getUserExpertise(user.user_id, ticket.payload.projectId);
  score += expertise * 5;

  // Factor 3: Prioridad del ticket
  if (ticket.payload.priority === 'URGENT') {
    score += 20;  // Preferir usuarios con más experiencia para urgentes
  }

  // Factor 4: Tiempo desde última asignación
  const hoursSinceLastAssignment = getHoursSince(user.last_active_at);
  score += Math.min(hoursSinceLastAssignment, 24);

  return score;
}
```

---

## 4. Eventos de Kafka

### 4.1 Eventos Consumidos

```typescript
// user.created (from Auth Service)
@EventPattern('user.created')
async handleUserCreated(@Payload() event: UserCreatedEvent) {
  const { userId, email, firstName, lastName } = event.payload;

  await this.userWorkloadRepository.save({
    user_id: userId,
    email,
    first_name: firstName,
    last_name: lastName,
    active_tickets_count: 0,
    max_capacity: 5,
    status: 'AVAILABLE',
  });

  console.log(`User ${userId} provisioned in Assignment Service`);
}

// ticket.created (from Ticket Service)
@EventPattern('ticket.created')
async handleTicketCreated(@Payload() event: TicketCreatedEvent) {
  const assigneeId = await this.assignTicket(event);

  if (assigneeId) {
    // Publicar evento de asignación
    await this.kafkaProducer.send({
      topic: 'assignment.ticket.assigned',
      messages: [{
        key: event.payload.ticketId,
        value: JSON.stringify({
          eventType: 'ticket.assigned',
          payload: {
            ticketId: event.payload.ticketId,
            projectId: event.payload.projectId,
            assigneeId,
            assignedAt: new Date().toISOString(),
          },
        }),
      }],
    });
  }
}

// ticket.status.updated (from Ticket Service)
@EventPattern('ticket.status.updated')
async handleTicketStatusUpdated(@Payload() event: TicketStatusUpdatedEvent) {
  const { newStatus, ticketId } = event.payload;

  // Si el ticket pasa a DONE, liberar capacidad
  if (newStatus === 'DONE') {
    const assignment = await this.assignmentsRepository.findOne({
      where: { ticketId, unassignedAt: IsNull() },
    });

    if (assignment) {
      // Decrementar contador
      await this.userWorkloadRepository.decrement(
        { user_id: assignment.userId },
        'active_tickets_count',
        1
      );

      // Marcar asignación como terminada
      assignment.unassignedAt = new Date();
      await this.assignmentsRepository.save(assignment);
    }
  }
}
```

### 4.2 Eventos Producidos

```typescript
// ticket.assigned
{
  eventType: 'ticket.assigned',
  payload: {
    ticketId: string,
    projectId: string,
    assigneeId: string,
    assignedAt: string,
  }
}
```

---

## 5. API Endpoints (Internal)

```typescript
// Consulta de carga de trabajo
GET    /assignments/workload              // Workload de todos los usuarios
GET    /assignments/workload/:userId      // Workload de un usuario
PATCH  /assignments/workload/:userId      // Actualizar capacidad/estado

// Historial
GET    /assignments/history/:ticketId     // Historial de asignaciones de un ticket
GET    /assignments/history/user/:userId  // Historial de un usuario

// Reasignación manual
POST   /assignments/reassign               // Reasignar ticket manualmente
```

---

## 6. Testing

```typescript
describe('Assignment Service', () => {
  it('should assign ticket to user with least workload', async () => {
    // Setup: 3 usuarios con diferentes cargas
    await createUser({ id: 'user1', active_tickets_count: 3 });
    await createUser({ id: 'user2', active_tickets_count: 1 });
    await createUser({ id: 'user3', active_tickets_count: 5 });

    const event = createTicketCreatedEvent({ ticketId: 'ticket1' });
    const assigneeId = await service.assignTicket(event);

    expect(assigneeId).toBe('user2');
  });

  it('should not assign if all users at capacity', async () => {
    await createUser({ id: 'user1', active_tickets_count: 5, max_capacity: 5 });

    const event = createTicketCreatedEvent({ ticketId: 'ticket1' });
    const assigneeId = await service.assignTicket(event);

    expect(assigneeId).toBeNull();
  });

  it('should decrement workload when ticket is done', async () => {
    const user = await createUser({ id: 'user1', active_tickets_count: 3 });
    await createAssignment({ ticketId: 'ticket1', userId: 'user1' });

    await service.handleTicketStatusUpdated({
      payload: { ticketId: 'ticket1', newStatus: 'DONE' },
    });

    const updated = await userWorkloadRepository.findOne({ where: { user_id: 'user1' } });
    expect(updated.active_tickets_count).toBe(2);
  });
});
```

---

## 7. Performance Considerations

### 7.1 Caching de Miembros de Proyecto

```typescript
// En vez de consultar Ticket Service cada vez, mantener cache local
// Sincronizado vía eventos: project.member.added, project.member.removed
```

### 7.2 Índices de Base de Datos

```sql
-- Para el query de asignación (ORDER BY active_tickets_count ASC)
CREATE INDEX idx_workload_assignment_lookup
ON user_workload(status, active_tickets_count, last_active_at);
```

---

## 8. Variables de Entorno

```env
DATABASE_URL=postgresql://admin:password@postgres:5432/syncro_assign_db
KAFKA_BROKERS=kafka:9092
KAFKA_GROUP_ID=assignment-service-group
PORT=3003
DEFAULT_USER_CAPACITY=5
```

---

**Changelog:**

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0.0 | 2025-12-20 | Especificación inicial |
