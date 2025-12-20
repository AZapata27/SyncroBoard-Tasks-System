# 🎫 SPEC-BACKEND-003: Ticket Service
## Project & Task Management Core

**Versión:** 1.0.0
**Última Actualización:** 2025-12-20
**Estado:** Draft
**Dependencias:** `libs/common`, `libs/contracts`, PostgreSQL, Redis, Kafka
**Puerto:** 3002
**Base de Datos:** `syncro_ticket_db`

---

## 1. Responsabilidades

1. **Gestión de Proyectos:** CRUD de proyectos y configuración
2. **Gestión de Tickets:** CRUD completo con estados dinámicos
3. **Gestión de Comentarios:** Hilos de discusión por ticket
4. **Estado Machine:** Validar transiciones de estado permitidas
5. **Tablero Kanban:** API optimizada para renderizado de tableros
6. **Sincronización:** Consumir eventos de asignación desde Assignment Service

---

## 2. Modelo de Datos

### 2.1 Entidades

```sql
-- Projects
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  key VARCHAR(10) UNIQUE NOT NULL,  -- ej: "SYNC", "PROJ"
  description TEXT,
  owner_id UUID NOT NULL,             -- User from Auth Service
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Project Members
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,              -- User from Auth Service
  role VARCHAR(50) DEFAULT 'MEMBER',  -- OWNER, ADMIN, MEMBER
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

-- Tickets
CREATE TABLE tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  code VARCHAR(50) UNIQUE NOT NULL,   -- ej: "SYNC-1", "SYNC-2"
  title VARCHAR(500) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'OPEN',  -- OPEN, IN_PROGRESS, REVIEW, DONE
  priority VARCHAR(20) DEFAULT 'MEDIUM', -- LOW, MEDIUM, HIGH, URGENT
  reporter_id UUID NOT NULL,
  assignee_id UUID NULL,              -- Actualizado por Assignment Service
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Comments
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Outbox
CREATE TABLE outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,
  aggregate_id VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT NOW(),
  sent_at TIMESTAMP NULL
);

-- Indexes
CREATE INDEX idx_tickets_project ON tickets(project_id);
CREATE INDEX idx_tickets_assignee ON tickets(assignee_id);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_code ON tickets(code);
CREATE INDEX idx_comments_ticket ON comments(ticket_id);
CREATE INDEX idx_outbox_status ON outbox_events(status);
```

### 2.2 Enumeraciones

```typescript
// libs/contracts/src/tickets/enums.ts

export enum TicketStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  IN_REVIEW = 'IN_REVIEW',
  DONE = 'DONE',
  BLOCKED = 'BLOCKED',
}

export enum TicketPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}
```

---

## 3. API Endpoints

### 3.1 Projects

```typescript
POST   /projects                    // Crear proyecto
GET    /projects                    // Listar proyectos del usuario
GET    /projects/:id                // Detalles de un proyecto
PATCH  /projects/:id                // Actualizar proyecto
DELETE /projects/:id                // Eliminar proyecto

POST   /projects/:id/members        // Agregar miembro
DELETE /projects/:id/members/:userId // Remover miembro
GET    /projects/:id/members        // Listar miembros
```

### 3.2 Tickets

```typescript
POST   /projects/:projectId/tickets     // Crear ticket
GET    /projects/:projectId/tickets     // Listar tickets (con filtros)
GET    /tickets/:id                     // Detalles de un ticket
PATCH  /tickets/:id                     // Actualizar ticket
PATCH  /tickets/:id/status              // Cambiar estado
DELETE /tickets/:id                     // Eliminar ticket

// Board View (Optimizado para Kanban)
GET    /projects/:projectId/board       // Tickets agrupados por estado
```

### 3.3 Comments

```typescript
POST   /tickets/:ticketId/comments      // Crear comentario
GET    /tickets/:ticketId/comments      // Listar comentarios
PATCH  /comments/:id                    // Editar comentario
DELETE /comments/:id                    // Eliminar comentario
```

---

## 4. Lógica de Negocio

### 4.1 Generación de Código de Ticket

```typescript
// Secuencial por proyecto: SYNC-1, SYNC-2, ...

async generateTicketCode(projectId: string): Promise<string> {
  const project = await this.projectRepository.findOne({
    where: { id: projectId },
  });

  const lastTicket = await this.ticketRepository.findOne({
    where: { projectId },
    order: { createdAt: 'DESC' },
  });

  let sequence = 1;
  if (lastTicket) {
    const lastCode = lastTicket.code.split('-')[1];
    sequence = parseInt(lastCode) + 1;
  }

  return `${project.key}-${sequence}`;
}
```

### 4.2 State Machine (Validación de Transiciones)

```typescript
const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  [TicketStatus.OPEN]: [TicketStatus.IN_PROGRESS, TicketStatus.BLOCKED],
  [TicketStatus.IN_PROGRESS]: [TicketStatus.IN_REVIEW, TicketStatus.BLOCKED, TicketStatus.OPEN],
  [TicketStatus.IN_REVIEW]: [TicketStatus.DONE, TicketStatus.IN_PROGRESS],
  [TicketStatus.DONE]: [TicketStatus.OPEN],
  [TicketStatus.BLOCKED]: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS],
};

async updateTicketStatus(ticketId: string, newStatus: TicketStatus, userId: string) {
  const ticket = await this.findOne(ticketId);

  if (!ALLOWED_TRANSITIONS[ticket.status].includes(newStatus)) {
    throw new BadRequestException(
      `Cannot transition from ${ticket.status} to ${newStatus}`
    );
  }

  const oldStatus = ticket.status;
  ticket.status = newStatus;
  ticket.updatedAt = new Date();

  // Guardar en transacción con outbox
  await this.dataSource.transaction(async (manager) => {
    await manager.save(ticket);

    const event = {
      eventType: 'ticket.status.updated',
      aggregateId: ticket.id,
      payload: {
        ticketId: ticket.id,
        projectId: ticket.projectId,
        oldStatus,
        newStatus,
        updatedBy: userId,
        timestamp: new Date().toISOString(),
      },
      status: 'PENDING',
    };

    await manager.save(OutboxEvent, event);
  });

  return ticket;
}
```

### 4.3 Caching de Board (Redis)

```typescript
async getProjectBoard(projectId: string) {
  const cacheKey = `project:board:${projectId}`;

  // Intentar obtener de cache
  const cached = await this.redisService.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // Si no existe, consultar DB
  const tickets = await this.ticketRepository.find({
    where: { projectId },
    order: { createdAt: 'DESC' },
  });

  const board = {
    [TicketStatus.OPEN]: tickets.filter(t => t.status === TicketStatus.OPEN),
    [TicketStatus.IN_PROGRESS]: tickets.filter(t => t.status === TicketStatus.IN_PROGRESS),
    [TicketStatus.IN_REVIEW]: tickets.filter(t => t.status === TicketStatus.IN_REVIEW),
    [TicketStatus.DONE]: tickets.filter(t => t.status === TicketStatus.DONE),
  };

  // Guardar en cache por 5 minutos
  await this.redisService.setex(cacheKey, 300, JSON.stringify(board));

  return board;
}

// Invalidar cache cuando se modifica un ticket
async invalidateBoardCache(projectId: string) {
  await this.redisService.del(`project:board:${projectId}`);
}
```

---

## 5. Eventos de Kafka

### 5.1 Eventos Producidos

```typescript
// ticket.created
{
  eventType: 'ticket.created',
  payload: {
    ticketId: string,
    projectId: string,
    reporterId: string,
    title: string,
    priority: TicketPriority,
    timestamp: string,
  }
}

// ticket.status.updated
{
  eventType: 'ticket.status.updated',
  payload: {
    ticketId: string,
    projectId: string,
    oldStatus: TicketStatus,
    newStatus: TicketStatus,
    updatedBy: string,
    timestamp: string,
  }
}

// ticket.commented
{
  eventType: 'ticket.commented',
  payload: {
    ticketId: string,
    projectId: string,
    commentId: string,
    authorId: string,
    content: string,
    timestamp: string,
  }
}
```

### 5.2 Eventos Consumidos

```typescript
// ticket.assigned (from Assignment Service)
@EventPattern('ticket.assigned')
async handleTicketAssigned(@Payload() event: TicketAssignedEvent) {
  const { ticketId, assigneeId } = event.payload;

  await this.ticketRepository.update(
    { id: ticketId },
    { assigneeId, updatedAt: new Date() }
  );

  // Invalidar cache del proyecto
  const ticket = await this.ticketRepository.findOne({ where: { id: ticketId } });
  await this.invalidateBoardCache(ticket.projectId);

  console.log(`Ticket ${ticketId} assigned to ${assigneeId}`);
}
```

---

## 6. Security & Authorization

### 6.1 Validación de Membresía de Proyecto

```typescript
// Decorator personalizado
@Injectable()
export class ProjectMemberGuard implements CanActivate {
  constructor(
    private projectMembersRepository: Repository<ProjectMember>,
  ) {}

  async canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const userId = request.headers['x-user-id'];
    const projectId = request.params.projectId || request.body.projectId;

    const member = await this.projectMembersRepository.findOne({
      where: { projectId, userId },
    });

    if (!member) {
      throw new ForbiddenException('Not a member of this project');
    }

    request.projectMember = member;
    return true;
  }
}

// Uso
@Post('projects/:projectId/tickets')
@UseGuards(ProjectMemberGuard)
async createTicket(@Param('projectId') projectId: string, @Body() dto: CreateTicketDto) {
  // ...
}
```

---

## 7. Performance Optimizations

### 7.1 Database Query Optimization

```typescript
// Mal: N+1 queries
const tickets = await this.ticketRepository.find({ where: { projectId } });
for (const ticket of tickets) {
  ticket.reporter = await this.userService.findById(ticket.reporterId);
}

// Bien: JOIN o batch fetch
const tickets = await this.ticketRepository
  .createQueryBuilder('ticket')
  .leftJoinAndSelect('ticket.comments', 'comments')
  .where('ticket.projectId = :projectId', { projectId })
  .getMany();

// Después buscar usuarios en batch
const userIds = [...new Set(tickets.map(t => t.reporterId))];
const users = await this.userService.findByIds(userIds);
```

### 7.2 Pagination

```typescript
GET /projects/:projectId/tickets?page=1&limit=50&status=OPEN&sortBy=createdAt&order=DESC

async findTickets(filters: TicketFiltersDto) {
  const { page = 1, limit = 50, status, sortBy = 'createdAt', order = 'DESC' } = filters;

  const [tickets, total] = await this.ticketRepository.findAndCount({
    where: {
      projectId: filters.projectId,
      ...(status && { status }),
    },
    order: { [sortBy]: order },
    skip: (page - 1) * limit,
    take: limit,
  });

  return {
    data: tickets,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}
```

---

## 8. Testing

```typescript
describe('Ticket Service', () => {
  it('should create ticket with auto-generated code', async () => {
    const ticket = await service.createTicket({
      projectId: 'proj-123',
      title: 'Test ticket',
      reporterId: 'user-123',
    });

    expect(ticket.code).toMatch(/^[A-Z]+-\d+$/);
  });

  it('should not allow invalid state transition', async () => {
    const ticket = await service.createTicket({ ... });

    await expect(
      service.updateTicketStatus(ticket.id, TicketStatus.DONE, 'user-123')
    ).rejects.toThrow('Cannot transition');
  });

  it('should emit ticket.created event to Kafka', async () => {
    const ticket = await service.createTicket({ ... });

    const event = await outboxRepository.findOne({
      where: { aggregateId: ticket.id },
    });

    expect(event.eventType).toBe('ticket.created');
  });
});
```

---

## 9. Variables de Entorno

```env
DATABASE_URL=postgresql://admin:password@postgres:5432/syncro_ticket_db
REDIS_URL=redis://redis:6379
KAFKA_BROKERS=kafka:9092
KAFKA_GROUP_ID=ticket-service-group
PORT=3002
```

---

**Changelog:**

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0.0 | 2025-12-20 | Especificación inicial |
