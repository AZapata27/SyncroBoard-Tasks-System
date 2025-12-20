# 🌐 SPEC-BACKEND-002: API Gateway
## Entry Point & WebSocket Server

**Versión:** 1.0.0
**Última Actualización:** 2025-12-20
**Estado:** Draft
**Dependencias:** `libs/common`, `libs/contracts`, Redis, Kafka, Auth Service
**Puerto:** 3000
**Base de Datos:** Redis (shared cache)

---

## 1. Responsabilidades del Servicio

1. **Punto de Entrada Único:** Todos los requests HTTP del frontend pasan por aquí
2. **Autenticación Centralizada:** Validar JWT antes de proxear a microservicios
3. **Autorización:** Verificar roles y permisos necesarios por endpoint
4. **Rate Limiting:** Protección contra abuso y DoS
5. **Request Routing:** Dirigir requests al microservicio correcto
6. **WebSocket Server:** Gestión de conexiones real-time con Socket.io
7. **Header Injection:** Agregar `x-user-id` y `x-user-roles` a requests internos

---

## 2. Arquitectura del Gateway

### 2.1 Diagrama de Flujo

```
┌──────────┐
│ Frontend │
└─────┬────┘
      │ HTTP/WS
      ↓
┌─────────────────────────┐
│ API Gateway (Port 3000) │
├─────────────────────────┤
│ 1. CORS                 │
│ 2. Auth Guard (JWT)     │
│ 3. Rate Limiter (Redis) │
│ 4. Request Logger       │
│ 5. Proxy Dispatcher     │
└─────┬───────────────────┘
      │
      ├→ Auth Service (3001)
      ├→ Ticket Service (3002)
      └→ Assignment Service (3003)
```

---

## 3. Routing Configuration

### 3.1 Path-Based Routing

| Path Pattern | Target Service | Auth Required | Roles |
|--------------|----------------|---------------|-------|
| `/auth/**` | Auth Service | No (excepto /me) | Any |
| `/tickets/**` | Ticket Service | Yes | DEVELOPER+ |
| `/projects/**` | Ticket Service | Yes | DEVELOPER+ |
| `/assignments/**` | Assignment Service | Yes | PROJECT_MANAGER+ |
| `/users/**` | Auth Service | Yes | ADMIN |

### 3.2 Proxy Implementation

```typescript
// apps/gateway/src/proxy/proxy.module.ts

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'AUTH_SERVICE',
        transport: Transport.TCP,
        options: {
          host: process.env.AUTH_SERVICE_HOST || 'auth-service',
          port: parseInt(process.env.AUTH_SERVICE_PORT) || 3001,
        },
      },
      {
        name: 'TICKET_SERVICE',
        transport: Transport.TCP,
        options: {
          host: process.env.TICKET_SERVICE_HOST || 'ticket-service',
          port: parseInt(process.env.TICKET_SERVICE_PORT) || 3002,
        },
      },
      {
        name: 'ASSIGNMENT_SERVICE',
        transport: Transport.TCP,
        options: {
          host: process.env.ASSIGNMENT_SERVICE_HOST || 'assignment-service',
          port: parseInt(process.env.ASSIGNMENT_SERVICE_PORT) || 3003,
        },
      },
    ]),
  ],
})
export class ProxyModule {}
```

---

## 4. Authentication & Authorization

### 4.1 JWT Validation Guard

```typescript
// apps/gateway/src/auth/jwt-auth.guard.ts

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Token not provided');
    }

    // 1. Verificar firma del JWT
    let payload;
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_PUBLIC_KEY,
      });
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    // 2. Verificar blacklist en Redis
    const isBlacklisted = await this.redisService.get(`blacklist:${token}`);
    if (isBlacklisted) {
      throw new UnauthorizedException('Token has been revoked');
    }

    // 3. Inyectar info del usuario en el request
    request.user = payload;
    request.headers['x-user-id'] = payload.sub;
    request.headers['x-user-roles'] = payload.roles.join(',');

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
```

### 4.2 Role-Based Authorization

```typescript
// apps/gateway/src/auth/roles.decorator.ts

export const Roles = (...roles: UserRole[]) => SetMetadata('roles', roles);

// apps/gateway/src/auth/roles.guard.ts

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.some((role) => user.roles?.includes(role));
  }
}

// Uso en controladores
@Get('projects')
@Roles(UserRole.DEVELOPER, UserRole.PROJECT_MANAGER, UserRole.ADMIN)
async getProjects() {
  // ...
}
```

---

## 5. Rate Limiting

### 5.1 Redis-Based Throttler

```typescript
// apps/gateway/src/app.module.ts

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        storage: new ThrottlerStorageRedisService(
          config.get('REDIS_URL')
        ),
        throttlers: [
          {
            name: 'default',
            ttl: 60000,        // 1 minuto
            limit: 100,        // 100 requests
          },
          {
            name: 'strict',
            ttl: 60000,
            limit: 10,         // Para endpoints sensibles
          },
        ],
      }),
    }),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
```

### 5.2 Custom Rate Limits per Endpoint

```typescript
@Post('tickets')
@Throttle({ default: { limit: 20, ttl: 60000 } })  // 20 tickets/min
async createTicket(@Body() dto: CreateTicketDto) {
  // ...
}

@Post('auth/login')
@Throttle({ strict: { limit: 5, ttl: 60000 } })  // 5 intentos/min
async login(@Body() dto: LoginDto) {
  // ...
}
```

---

## 6. WebSocket Server

### 6.1 Gateway Setup

```typescript
// apps/gateway/src/websocket/events.gateway.ts

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL,
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private jwtService: JwtService,
    private redisService: RedisService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      // Validar token en handshake
      const token = client.handshake.auth.token;
      const payload = await this.jwtService.verifyAsync(token);

      client.data.userId = payload.sub;
      client.data.roles = payload.roles;

      console.log(`Client connected: ${client.id} (User: ${payload.sub})`);
    } catch (error) {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinProject')
  async handleJoinProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { projectId: string },
  ) {
    // Validar que el usuario tiene acceso al proyecto
    // TODO: Consultar Ticket Service

    await client.join(`project:${data.projectId}`);
    return { success: true, projectId: data.projectId };
  }

  @SubscribeMessage('leaveProject')
  async handleLeaveProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { projectId: string },
  ) {
    await client.leave(`project:${data.projectId}`);
    return { success: true };
  }
}
```

### 6.2 Redis Adapter (Multi-Instance Support)

```typescript
// apps/gateway/src/websocket/redis-io.adapter.ts

import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;

  async connectToRedis(): Promise<void> {
    const pubClient = createClient({ url: process.env.REDIS_URL });
    const subClient = pubClient.duplicate();

    await Promise.all([pubClient.connect(), subClient.connect()]);

    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: any): any {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }
}

// En main.ts
const app = await NestFactory.create(AppModule);
const redisIoAdapter = new RedisIoAdapter(app);
await redisIoAdapter.connectToRedis();
app.useWebSocketAdapter(redisIoAdapter);
```

---

## 7. Kafka Consumer (Para WebSocket Broadcast)

### 7.1 Consumir Eventos y Emitir a WebSocket

```typescript
// apps/gateway/src/kafka/kafka-ws-bridge.service.ts

@Injectable()
export class KafkaWsBridgeService implements OnModuleInit {
  constructor(
    private eventsGateway: EventsGateway,
    @Inject('KAFKA_CLIENT') private kafkaClient: ClientKafka,
  ) {}

  async onModuleInit() {
    // Suscribirse a eventos relevantes
    this.kafkaClient.subscribeToResponseOf('ticket.status.updated');
    this.kafkaClient.subscribeToResponseOf('ticket.assigned');
    this.kafkaClient.subscribeToResponseOf('ticket.commented');

    await this.kafkaClient.connect();
  }

  @EventPattern('ticket.status.updated')
  async handleTicketStatusUpdated(@Payload() event: TicketStatusUpdatedEvent) {
    // Emitir a la sala del proyecto
    this.eventsGateway.server
      .to(`project:${event.payload.projectId}`)
      .emit('ticketUpdated', {
        ticketId: event.payload.ticketId,
        newStatus: event.payload.newStatus,
        updatedBy: event.payload.updatedBy,
      });
  }

  @EventPattern('ticket.assigned')
  async handleTicketAssigned(@Payload() event: TicketAssignedEvent) {
    this.eventsGateway.server
      .to(`project:${event.payload.projectId}`)
      .emit('ticketAssigned', {
        ticketId: event.payload.ticketId,
        assigneeId: event.payload.assigneeId,
      });
  }
}
```

---

## 8. Error Handling

### 8.1 Global Exception Filter

```typescript
// apps/gateway/src/filters/http-exception.filter.ts

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.message;
    }

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    };

    // Log error
    console.error('HTTP Exception:', errorResponse);

    response.status(status).json(errorResponse);
  }
}
```

### 8.2 Circuit Breaker (Fase 2)

```typescript
// Implementar con @nestjs/terminus
// Si un servicio falla > 50% en 30s → abrir circuito
// Responder con fallback o error 503
```

---

## 9. Security Headers

### 9.1 Helmet Configuration

```typescript
// main.ts
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));
```

### 9.2 CORS Configuration

```typescript
app.enableCors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
```

---

## 10. Monitoring & Observability

### 10.1 Request Logging

```typescript
// apps/gateway/src/middleware/logger.middleware.ts

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, ip } = req;
    const userAgent = req.get('user-agent') || '';
    const startTime = Date.now();

    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - startTime;

      console.log(JSON.stringify({
        method,
        url: originalUrl,
        statusCode,
        duration,
        ip,
        userAgent,
        userId: req['user']?.sub || 'anonymous',
      }));
    });

    next();
  }
}
```

### 10.2 Métricas

| Métrica | Tipo | Descripción |
|---------|------|-------------|
| `gateway.requests.total` | Counter | Total de requests |
| `gateway.requests.duration` | Histogram | Duración de requests |
| `gateway.websocket.connections` | Gauge | Conexiones activas |
| `gateway.rate_limit.exceeded` | Counter | Requests bloqueados |

---

## 11. Variables de Entorno

```env
# App
PORT=3000
NODE_ENV=production
FRONTEND_URL=http://localhost:3001

# Redis
REDIS_URL=redis://redis:6379

# JWT
JWT_PUBLIC_KEY=<base64-public-key>

# Microservices
AUTH_SERVICE_HOST=auth-service
AUTH_SERVICE_PORT=3001
TICKET_SERVICE_HOST=ticket-service
TICKET_SERVICE_PORT=3002
ASSIGNMENT_SERVICE_HOST=assignment-service
ASSIGNMENT_SERVICE_PORT=3003

# Kafka
KAFKA_BROKERS=kafka:9092
KAFKA_GROUP_ID=gateway-group

# Rate Limiting
RATE_LIMIT_TTL=60000
RATE_LIMIT_MAX=100
```

---

## 12. Testing

### 12.1 E2E Tests

```typescript
describe('Gateway E2E', () => {
  it('should block unauthenticated requests to /tickets', async () => {
    return request(app.getHttpServer())
      .get('/tickets')
      .expect(401);
  });

  it('should allow authenticated requests', async () => {
    const token = generateValidToken({ sub: 'user123', roles: ['DEVELOPER'] });

    return request(app.getHttpServer())
      .get('/tickets')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('should enforce rate limiting', async () => {
    const token = generateValidToken();

    for (let i = 0; i < 100; i++) {
      await request(app.getHttpServer())
        .get('/tickets')
        .set('Authorization', `Bearer ${token}`);
    }

    // 101st request should be blocked
    return request(app.getHttpServer())
      .get('/tickets')
      .set('Authorization', `Bearer ${token}`)
      .expect(429);
  });
});
```

---

## 13. Referencias

- [NestJS Microservices](https://docs.nestjs.com/microservices/basics)
- [Socket.io with Redis](https://socket.io/docs/v4/redis-adapter/)
- [NestJS WebSockets](https://docs.nestjs.com/websockets/gateways)
- [Helmet.js Security](https://helmetjs.github.io/)

---

**Changelog:**

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0.0 | 2025-12-20 | Especificación inicial |
