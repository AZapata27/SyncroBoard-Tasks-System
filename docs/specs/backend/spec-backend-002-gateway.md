## 1. Responsabilidades del API Gateway

El Gateway debe centralizar las siguientes funciones para evitar que los microservicios repitan lógica:

1. **Enrutamiento Dinámico:** Dirigir `/auth/*` al Auth Service y `/tickets/*` al Ticket Service.
2. **Autenticación Centralizada:** Validar el JWT una sola vez antes de permitir que la petición siga su curso.
3. **Rate Limiting (vía Redis):** Evitar ataques de fuerza bruta o abuso de la API.
4. **Agregación de Respuesta:** En flujos complejos, el Gateway puede consultar dos servicios y devolver un solo JSON.
5. **Gestión de WebSockets:** Mantener la conexión abierta con el cliente para actualizaciones en tiempo real.

---

## 2. Diseño Arquitectónico del Gateway

### Flujo de una Petición:

1. **Request del Cliente:** Llega con un Header `Authorization: Bearer <token>`.
2. **Guards (Globales):** El Gateway verifica el token.
3. **Throttler (Redis):** Se verifica si el usuario ha excedido el límite de peticiones (ej. 100 req/min).
4. **Proxy/Dispatch:** La petición se envía al microservicio correspondiente mediante **HTTP (Axios/Terminus)** o **TCP/gRPC** para mayor velocidad.

---

## 3. Implementación Técnica en SyncroBoard

En tu monorepo, el Gateway en `apps/gateway/` debería estructurarse así:

### A. Configuración del Proxy (Proxy Module)

NestJS no necesita redirigir manualmente cada ruta. Podemos usar un módulo de Proxy o inyectar Clientes de Microservicios:

```typescript
// apps/gateway/src/app.module.ts
@Module({
  imports: [
    // Configuración de Redis para Rate Limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        storage: new ThrottlerStorageRedisService(config.get('REDIS_URL')),
        ttl: 60,
        limit: 100,
      }),
    }),
    // Clientes para hablar con microservicios
    ClientsModule.register([
      { name: 'TICKET_SERVICE', transport: Transport.TCP, options: { host: 'ticket-service', port: 3001 } },
      { name: 'AUTH_SERVICE', transport: Transport.TCP, options: { host: 'auth-service', port: 3002 } },
    ]),
  ],
})

```

### B. El "Token Passthrough"

El Gateway valida el JWT, extrae el `userId` y lo inyecta en los headers que viajan hacia los microservicios internos. Así, el **Ticket Service** no necesita validar el token de nuevo, solo confía en el header `x-user-id` que viene del Gateway.

---

## 4. Gestión de Real-time (WebSockets + Redis)

Para cumplir con el requerimiento de ver tickets moverse en tiempo real, el Gateway actuará como el **WebSocket Server**:

1. **Conexión:** El frontend se conecta al Gateway vía Socket.io.
2. **Suscripción:** El usuario se une a una "sala" basada en el `projectId`.
3. **Notificación:** Cuando el **Ticket Service** emite un evento a Kafka (`ticket.updated`), el **Notification Service** (o el mismo Gateway escuchando Kafka) emite un mensaje al socket de esa sala específica.

---

## 5. Requerimientos Técnicos para el Gateway

* **Timeout:** Máximo 5 segundos para peticiones internas.
* **Circuit Breaker:** Si el `Assignment Service` falla, el Gateway debe responder con un error amigable o un valor por defecto, sin tumbar todo el sistema.
* **CORS:** Configurado estrictamente para el dominio del frontend.

**Siguiente paso:**
¿Quieres que definamos el **contrato de autenticación** (cómo el Gateway le pide al Auth Service que valide un usuario) o pasamos a diseñar el **módulo de Kafka compartido** en la librería `common`?