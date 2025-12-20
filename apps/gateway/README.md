# API Gateway

Gateway principal que actúa como punto de entrada único para todos los microservicios del sistema SyncroBoard.

## 🎯 Características

- **Proxy HTTP**: Enruta requests a los microservicios backend
- **WebSocket Gateway**: Notificaciones en tiempo real con Socket.IO
- **Autenticación JWT**: Validación de tokens en todas las requests
- **Rate Limiting**: Control de tasa con Redis
- **CORS**: Configurado para desarrollo y producción
- **Logging**: Interceptor global para todas las requests
- **Error Handling**: Manejo centralizado de errores

## 🏗️ Arquitectura

```
Gateway (Port 3000)
├── /api/v1/auth/*           → auth-service (Port 3001)
├── /api/v1/tickets/*        → ticket-service (Port 3002)
├── /api/v1/comments/*       → ticket-service (Port 3002)
├── /api/v1/assignments/*    → assignment-service (Port 3003)
└── /notifications (WS)      → WebSocket para notificaciones real-time
```

## 📦 Módulos

### 1. Auth Module
Proxy para autenticación y gestión de usuarios

**Endpoints:**
- `POST /api/v1/auth/register` - Registro de usuarios
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh` - Refresh token
- `POST /api/v1/auth/logout` - Logout (requiere auth)
- `GET /api/v1/auth/me` - Obtener perfil (requiere auth)

### 2. Tickets Module
Proxy para gestión de tickets y comentarios

**Endpoints:**
- `POST /api/v1/tickets` - Crear ticket (requiere auth)
- `GET /api/v1/tickets` - Listar tickets (requiere auth)
- `GET /api/v1/tickets/:id` - Obtener ticket (requiere auth)
- `PUT /api/v1/tickets/:id` - Actualizar ticket (requiere auth)
- `DELETE /api/v1/tickets/:id` - Eliminar ticket (requiere auth + role)
- `POST /api/v1/comments` - Crear comentario (requiere auth)
- `GET /api/v1/comments/ticket/:ticketId` - Listar comentarios (requiere auth)
- `DELETE /api/v1/comments/:id` - Eliminar comentario (requiere auth)

### 3. Assignments Module
Proxy para gestión de asignaciones

**Endpoints:**
- `POST /api/v1/assignments/assign` - Asignar usuario a ticket (requiere auth)
- `POST /api/v1/assignments/unassign` - Desasignar usuario (requiere auth)
- `GET /api/v1/assignments` - Listar asignaciones (requiere auth)
- `GET /api/v1/assignments/ticket/:ticketId` - Asignaciones por ticket (requiere auth)
- `GET /api/v1/assignments/user/:userId` - Asignaciones por usuario (requiere auth)

### 4. Notifications Module (WebSocket)
Gateway WebSocket para notificaciones en tiempo real

**Events (Cliente → Servidor):**
- `subscribe:ticket` - Suscribirse a un ticket
- `unsubscribe:ticket` - Desuscribirse de un ticket
- `subscribe:project` - Suscribirse a un proyecto
- `unsubscribe:project` - Desuscribirse de un proyecto

**Events (Servidor → Cliente):**
- `connected` - Confirmación de conexión
- `notification` - Notificación genérica
- `ticket:created` - Ticket creado
- `ticket:updated` - Ticket actualizado
- `ticket:status:changed` - Status del ticket cambió
- `ticket:deleted` - Ticket eliminado
- `ticket:comment:added` - Comentario agregado
- `assignment:created` - Usuario asignado
- `assignment:removed` - Usuario desasignado

Ver [WEBSOCKET-CLIENT-EXAMPLE.md](./WEBSOCKET-CLIENT-EXAMPLE.md) para ejemplos de uso.

## 🔐 Autenticación

### JWT Guards

El gateway usa guards globales para proteger endpoints:

- `JwtAuthGuard` - Validación de JWT en todas las requests (excepto rutas marcadas como `@Public()`)
- `RolesGuard` - Validación de roles (ADMIN, PROJECT_MANAGER, DEVELOPER, VIEWER)

### Decoradores

- `@Public()` - Marca un endpoint como público (sin autenticación)
- `@CurrentUser()` - Extrae información del usuario del JWT
- `@Roles(...roles)` - Requiere roles específicos

### Ejemplo de Uso

```typescript
@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TicketsController {

  @Get()
  findAll(@CurrentUser('userId') userId: string) {
    // userId es extraído del JWT
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  delete(@Param('id') id: string) {
    // Solo ADMIN o PROJECT_MANAGER pueden eliminar
  }
}
```

## 🚀 Ejecución

### Desarrollo

```bash
npm run dev:gateway
```

### Build

```bash
nx build gateway
```

### Producción

```bash
node dist/apps/gateway/main.js
```

## ⚙️ Configuración

### Variables de Entorno (.env)

```bash
# Server
PORT=3000
NODE_ENV=development

# Auth Service
AUTH_SERVICE_URL=http://localhost:3001
AUTH_SERVICE_TIMEOUT=5000

# Ticket Service
TICKET_SERVICE_URL=http://localhost:3002
TICKET_SERVICE_TIMEOUT=5000

# Assignment Service
ASSIGNMENT_SERVICE_URL=http://localhost:3003
ASSIGNMENT_SERVICE_TIMEOUT=5000

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# CORS
CORS_ORIGIN=http://localhost:3100
```

## 📊 Monitoreo y Logs

### Logging Interceptor

Todas las requests son logueadas automáticamente:

```
[HTTP] Incoming Request: GET /api/v1/tickets
[HTTP] Request Body: {...}
[HTTP] Outgoing Response: GET /api/v1/tickets 200 - 45ms
```

### Error Handling

Los errores de los servicios backend son propagados correctamente:

```typescript
try {
  const response = await this.httpService.get(url);
  return response.data;
} catch (error: any) {
  throw new HttpException(
    error.response?.data || 'Service unavailable',
    error.response?.status || 500
  );
}
```

## 🧪 Testing

```bash
# Unit tests
nx test gateway

# E2E tests
nx e2e gateway-e2e

# Test con coverage
nx test gateway --coverage
```

## 🔄 Circuit Breaker (Futuro)

Implementar circuit breaker para manejar fallos de servicios:

```typescript
import { CircuitBreaker } from '@nestjs/circuit-breaker';

@Injectable()
export class TicketsService {
  @CircuitBreaker({
    timeout: 5000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000
  })
  async findAll() {
    // ...
  }
}
```

## 📈 Rate Limiting (Futuro)

Agregar rate limiting con Redis:

```typescript
import { ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      ttl: 60,
      limit: 10,
    }),
  ],
})
```

## 🔍 Health Checks

Agregar health checks para monitoreo:

```typescript
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      services: {
        auth: await this.checkService('auth'),
        tickets: await this.checkService('tickets'),
        assignments: await this.checkService('assignments'),
      }
    };
  }
}
```

## 📚 Recursos

- [NestJS Microservices](https://docs.nestjs.com/microservices/basics)
- [Socket.IO Documentation](https://socket.io/docs/v4/)
- [JWT Best Practices](https://jwt.io/introduction)
- [API Gateway Pattern](https://microservices.io/patterns/apigateway.html)

## 🐛 Troubleshooting

### WebSocket no conecta

Verificar que el token JWT sea válido:
```typescript
const token = localStorage.getItem('accessToken');
const socket = io('http://localhost:3000/notifications', {
  auth: { token }
});
```

### Service unavailable

Verificar que los servicios backend estén corriendo:
```bash
docker-compose ps
npm run dev:auth
npm run dev:ticket
npm run dev:assignment
```

### CORS errors

Actualizar `CORS_ORIGIN` en `.env` con la URL del frontend:
```bash
CORS_ORIGIN=http://localhost:3100
```
