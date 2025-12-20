# 🔐 SPEC-BACKEND-001: Auth Service
## Identity & Access Management

**Versión:** 1.0.0
**Última Actualización:** 2025-12-20
**Estado:** Draft
**Dependencias:** `libs/common`, `libs/contracts`, PostgreSQL, Redis, Kafka
**Puerto:** 3001
**Base de Datos:** `syncro_auth_db`

---

## 1. Responsabilidades del Servicio

El **Auth Service** es el guardián de la identidad en SyncroBoard. Su función es:

1. **Gestión de Identidad:** Registro, autenticación y perfilado de usuarios
2. **Autenticación Híbrida:** Soporte para Google OAuth2 y credenciales locales
3. **Gestión de Sesiones:** JWT (Access + Refresh Tokens)
4. **Autorización (RBAC):** Definición y validación de roles y permisos
5. **Provisioning:** Notificar a otros servicios cuando un nuevo usuario es creado

### Límites del Servicio (Out of Scope)
- ❌ No gestiona permisos específicos de proyectos (responsabilidad del Ticket Service)
- ❌ No envía emails de verificación directamente (responsabilidad del Notification Service)
- ❌ No almacena carga de trabajo de usuarios (responsabilidad del Assignment Service)

---

## 2. Modelo de Datos

### 2.1 Diagrama de Entidades

```
┌─────────────────────────────────────────────┐
│ users                                       │
├─────────────────────────────────────────────┤
│ id (UUID, PK)                               │
│ email (VARCHAR 255, UNIQUE, INDEXED)        │
│ password_hash (VARCHAR 255, NULLABLE)       │
│ provider (ENUM: LOCAL, GOOGLE)              │
│ first_name (VARCHAR 100)                    │
│ last_name (VARCHAR 100)                     │
│ avatar_url (VARCHAR 512, NULLABLE)          │
│ is_active (BOOLEAN, DEFAULT TRUE)           │
│ created_at (TIMESTAMP)                      │
│ updated_at (TIMESTAMP)                      │
└─────────────────────────────────────────────┘
          │
          │ 1:N
          ↓
┌─────────────────────────────────────────────┐
│ user_roles                                  │
├─────────────────────────────────────────────┤
│ id (UUID, PK)                               │
│ user_id (UUID, FK → users.id)               │
│ role (ENUM: ADMIN, PROJECT_MANAGER,         │
│       DEVELOPER, VIEWER)                    │
│ created_at (TIMESTAMP)                      │
└─────────────────────────────────────────────┘
```

### 2.2 Enumeraciones

```typescript
// libs/contracts/src/auth/enums.ts

export enum AuthProvider {
  LOCAL = 'LOCAL',
  GOOGLE = 'GOOGLE',
}

export enum UserRole {
  ADMIN = 'ADMIN',
  PROJECT_MANAGER = 'PROJECT_MANAGER',
  DEVELOPER = 'DEVELOPER',
  VIEWER = 'VIEWER',
}
```

### 2.3 Índices Requeridos

| Tabla | Campo | Tipo | Razón |
|-------|-------|------|-------|
| `users` | `email` | UNIQUE + BTREE | Búsqueda frecuente en login |
| `users` | `provider` | BTREE | Filtrado por proveedor |
| `user_roles` | `user_id` | BTREE + FK | Joins con usuarios |

---

## 3. Contratos de API

### 3.1 REST Endpoints

#### `POST /auth/register` - Registro Local

**Request:**
```typescript
{
  email: string;          // email@example.com
  password: string;       // Min 8 chars, 1 uppercase, 1 number
  firstName: string;      // Min 2 chars
  lastName: string;       // Min 2 chars
}
```

**Response (201):**
```typescript
{
  accessToken: string;    // JWT válido por 15 min
  refreshToken: string;   // JWT válido por 7 días
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    roles: UserRole[];
  }
}
```

**Errores:**
- `400 Bad Request`: Email inválido o password débil
- `409 Conflict`: Email ya registrado

---

#### `POST /auth/login` - Login Local

**Request:**
```typescript
{
  email: string;
  password: string;
}
```

**Response (200):**
```typescript
{
  accessToken: string;
  refreshToken: string;
  user: UserDTO;
}
```

**Errores:**
- `401 Unauthorized`: Credenciales inválidas
- `403 Forbidden`: Usuario desactivado

---

#### `POST /auth/google` - Autenticación con Google

**Request:**
```typescript
{
  idToken: string;        // Token de Google (validado con google-auth-library)
}
```

**Flujo:**
1. Validar `idToken` con Google
2. Extraer email, nombre, foto del payload
3. Si el usuario no existe → crear (provisionamiento automático)
4. Si existe → actualizar `avatar_url` si cambió
5. Generar JWT propio de SyncroBoard

**Response (200/201):**
```typescript
{
  accessToken: string;
  refreshToken: string;
  user: UserDTO;
  isNewUser: boolean;     // true si fue creado en esta request
}
```

**Evento Kafka emitido:**
- Si `isNewUser === true` → `user.created`

---

#### `POST /auth/refresh` - Renovar Access Token

**Request:**
```typescript
{
  refreshToken: string;
}
```

**Lógica:**
1. Validar firma del Refresh Token
2. Verificar que existe en Redis (no fue revocado)
3. Generar nuevo Access Token con misma info de usuario
4. (Opcional) Rotar Refresh Token

**Response (200):**
```typescript
{
  accessToken: string;
  refreshToken: string;   // Nuevo si se implementa rotación
}
```

---

#### `POST /auth/logout` - Cerrar Sesión

**Request:**
```typescript
{
  refreshToken: string;
}
```

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Lógica:**
1. Eliminar Refresh Token de Redis
2. Agregar Access Token a blacklist en Redis con TTL = tiempo restante de expiración

**Response (204):**
```
No Content
```

---

#### `GET /auth/me` - Perfil del Usuario Autenticado

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response (200):**
```typescript
{
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  roles: UserRole[];
  provider: AuthProvider;
  createdAt: string;
}
```

---

### 3.2 Internal Endpoints (Solo desde Gateway)

#### `POST /auth/internal/validate-token`

**Request:**
```typescript
{
  token: string;
}
```

**Response (200):**
```typescript
{
  userId: string;
  roles: UserRole[];
  email: string;
}
```

**Uso:** El Gateway usa este endpoint para validar tokens antes de proxear requests.

---

## 4. Contratos de Eventos (Kafka)

### 4.1 Eventos Producidos

#### `user.created`

**Topic:** `auth.user.created`

**Payload:**
```typescript
// libs/contracts/src/auth/events/user-created.event.ts

export interface UserCreatedEvent {
  eventId: string;              // UUID único del evento
  eventType: 'user.created';
  timestamp: string;            // ISO 8601
  payload: {
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    roles: UserRole[];
    provider: AuthProvider;
  };
}
```

**Consumidores:**
- **Assignment Service:** Crea entrada en `user_workload` con capacidad inicial
- **Notification Service:** Envía email de bienvenida

**Garantía:** Publicado usando Transactional Outbox Pattern

---

### 4.2 Eventos Consumidos

*Ninguno en Phase 1*

---

## 5. Lógica de Negocio

### 5.1 Algoritmo de Hash de Contraseñas

**Librería:** `argon2` (recomendado sobre bcrypt por seguridad y performance)

**Configuración:**
```typescript
import * as argon2 from 'argon2';

// Hash
const hash = await argon2.hash(password, {
  type: argon2.argon2id,
  memoryCost: 65536,    // 64 MB
  timeCost: 3,          // 3 iteraciones
  parallelism: 4,
});

// Verify
const isValid = await argon2.verify(hash, password);
```

---

### 5.2 Estrategia de JWT

#### Access Token

**Payload:**
```typescript
{
  sub: string;          // user.id
  email: string;
  roles: UserRole[];
  type: 'access';
  iat: number;
  exp: number;          // iat + 15 minutos
}
```

**Firma:** RS256 (asimétrica)
- Private Key: Solo Auth Service
- Public Key: Distribuida a todos los servicios (validación local)

#### Refresh Token

**Payload:**
```typescript
{
  sub: string;
  type: 'refresh';
  jti: string;          // JWT ID único (para revocación)
  iat: number;
  exp: number;          // iat + 7 días
}
```

**Storage en Redis:**
```
Key: refresh_token:{jti}
Value: {userId, email, createdAt}
TTL: 7 días
```

---

### 5.3 Validación con Google

```typescript
import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

async function verifyGoogleToken(idToken: string) {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();

  return {
    email: payload.email,
    firstName: payload.given_name,
    lastName: payload.family_name,
    avatarUrl: payload.picture,
    emailVerified: payload.email_verified,
  };
}
```

**Variables de Entorno:**
- `GOOGLE_CLIENT_ID`: Desde Google Cloud Console
- `GOOGLE_CLIENT_SECRET`: (Solo si usas server-side flow)

---

## 6. Implementación del Transactional Outbox

### 6.1 Tabla Outbox

```sql
CREATE TABLE outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,
  aggregate_id VARCHAR(255) NOT NULL,  -- user.id
  payload JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, SENT, FAILED
  created_at TIMESTAMP DEFAULT NOW(),
  sent_at TIMESTAMP NULL
);

CREATE INDEX idx_outbox_status ON outbox_events(status);
CREATE INDEX idx_outbox_created ON outbox_events(created_at);
```

### 6.2 Flujo de Guardado

```typescript
// Dentro de una transacción de TypeORM
await queryRunner.startTransaction();

try {
  // 1. Guardar usuario
  const user = await userRepository.save(newUser);

  // 2. Guardar evento en outbox
  const outboxEvent = {
    eventType: 'user.created',
    aggregateId: user.id,
    payload: {
      userId: user.id,
      email: user.email,
      // ...resto del payload
    },
    status: 'PENDING',
  };

  await outboxRepository.save(outboxEvent);

  await queryRunner.commitTransaction();
} catch (error) {
  await queryRunner.rollbackTransaction();
  throw error;
}
```

### 6.3 Outbox Relay Worker

```typescript
// apps/auth-service/src/outbox/outbox-relay.service.ts

@Injectable()
export class OutboxRelayService {
  @Cron('*/10 * * * * *')  // Cada 10 segundos
  async processOutbox() {
    const pendingEvents = await this.outboxRepository.find({
      where: { status: 'PENDING' },
      take: 100,
      order: { createdAt: 'ASC' },
    });

    for (const event of pendingEvents) {
      try {
        await this.kafkaProducer.send({
          topic: `auth.${event.eventType}`,
          messages: [{
            key: event.aggregateId,
            value: JSON.stringify(event.payload),
          }],
        });

        event.status = 'SENT';
        event.sentAt = new Date();
        await this.outboxRepository.save(event);
      } catch (error) {
        event.status = 'FAILED';
        await this.outboxRepository.save(event);
        // Log error para debugging
      }
    }
  }
}
```

---

## 7. Seguridad

### 7.1 Validación de Entrada (DTOs)

```typescript
// apps/auth-service/src/auth/dto/register.dto.ts

import { IsEmail, IsString, MinLength, Matches } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    { message: 'Password too weak' }
  )
  password: string;

  @IsString()
  @MinLength(2)
  firstName: string;

  @IsString()
  @MinLength(2)
  lastName: string;
}
```

### 7.2 Rate Limiting

**Protección contra Brute Force:**

```typescript
// apps/auth-service/src/auth/auth.controller.ts

@Controller('auth')
export class AuthController {

  @Post('login')
  @Throttle(5, 60)  // 5 intentos por minuto
  async login(@Body() dto: LoginDto) {
    // ...
  }

  @Post('register')
  @Throttle(3, 3600)  // 3 registros por hora
  async register(@Body() dto: RegisterDto) {
    // ...
  }
}
```

### 7.3 Protección de Datos Sensibles

**Nunca exponer:**
- `password_hash` en ninguna respuesta de API
- Refresh Tokens en logs
- Private Key de JWT

**Logging Seguro:**
```typescript
// ❌ MAL
logger.log(`User logged in: ${JSON.stringify(user)}`);

// ✅ BIEN
logger.log(`User logged in: ${user.id}`);
```

---

## 8. Testing

### 8.1 Unit Tests

**Cobertura Mínima:** 80%

**Casos Críticos:**
- Registro con email duplicado debe fallar
- Login con password incorrecta debe fallar
- Hash de contraseña nunca debe ser reversible
- JWT debe expirar después del tiempo configurado

### 8.2 Integration Tests

```typescript
describe('Auth Integration', () => {
  it('should register, login, and access protected route', async () => {
    // 1. Register
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'test@example.com',
        password: 'SecurePass123!',
        firstName: 'Test',
        lastName: 'User',
      })
      .expect(201);

    const { accessToken } = registerRes.body;

    // 2. Access /me
    const meRes = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(meRes.body.email).toBe('test@example.com');
  });
});
```

---

## 9. Deployment

### 9.1 Variables de Entorno

```env
# Database
DATABASE_URL=postgresql://admin:password@postgres:5432/syncro_auth_db

# Redis
REDIS_URL=redis://redis:6379

# Kafka
KAFKA_BROKERS=kafka:9092
KAFKA_GROUP_ID=auth-service-group

# JWT
JWT_PRIVATE_KEY=<base64-encoded-private-key>
JWT_PUBLIC_KEY=<base64-encoded-public-key>
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# Google OAuth
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>

# App
NODE_ENV=production
PORT=3001
```

### 9.2 Health Check

```typescript
@Get('health')
healthCheck() {
  return {
    status: 'ok',
    database: this.dbConnection.isConnected,
    redis: this.redisClient.status === 'ready',
    kafka: this.kafkaProducer.isConnected,
    timestamp: new Date().toISOString(),
  };
}
```

---

## 10. Métricas y Observabilidad

### 10.1 Métricas Clave

| Métrica | Tipo | Descripción |
|---------|------|-------------|
| `auth.register.total` | Counter | Total de registros exitosos |
| `auth.login.total` | Counter | Total de logins exitosos |
| `auth.login.failed` | Counter | Total de logins fallidos |
| `auth.token.refresh.total` | Counter | Total de renovaciones de token |
| `auth.google.auth.duration` | Histogram | Tiempo de validación con Google |

### 10.2 Logs Estructurados

```typescript
logger.log({
  event: 'user_registered',
  userId: user.id,
  provider: user.provider,
  timestamp: new Date().toISOString(),
});
```

---

## 11. Roadmap de Funcionalidades

### Phase 1 (MVP)
- [x] Registro local
- [x] Login local
- [x] Google OAuth
- [x] JWT management
- [x] Outbox pattern

### Phase 2
- [ ] Email verification
- [ ] Password reset
- [ ] Two-factor authentication (2FA)
- [ ] Account deactivation

### Phase 3
- [ ] OAuth con GitHub/Microsoft
- [ ] Audit log de accesos
- [ ] Geolocalización de logins
- [ ] Detección de actividad sospechosa

---

## 12. Referencias

### 12.1 Librerías Clave
- [Passport.js](http://www.passportjs.org/) - Estrategias de autenticación
- [google-auth-library](https://github.com/googleapis/google-auth-library-nodejs) - Validación de Google
- [argon2](https://github.com/ranisalt/node-argon2) - Hashing de contraseñas
- [@nestjs/jwt](https://docs.nestjs.com/security/authentication) - JWT en NestJS

### 12.2 Specs Relacionadas
- `spec-base-000-requerimientos.md` - Arquitectura general
- `spec-backend-002-gateway.md` - Integración con Gateway
- `spec-backend-005-shared-libraries.md` - Uso de libs/common

---

**Changelog:**

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0.0 | 2025-12-20 | Especificación inicial |
