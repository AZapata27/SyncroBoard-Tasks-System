
## 1. Estrategia de Monorepo con Nx

Nx nos permite gestionar múltiples aplicaciones NestJS con un sistema de caché inteligente y dependencias claras entre proyectos.

### Estructura de Carpetas Sugerida:

* **`apps/`**: Contiene los microservicios (`auth`, `ticket`, `assignment`, `notification`, `gateway`).
* **`libs/contracts/`**: Interfaces de TypeScript y DTOs para Kafka y WebSockets.
* **`libs/common/`**: Lógica reutilizable como el `KafkaModule`, `RedisModule`, interceptores de errores y decoradores de usuario.
* **`libs/database/`**: Configuraciones base de TypeORM y migraciones compartidas.

---

## 2. El "Kafka Shared Module" (libs/common)

Para evitar repetir la configuración de Kafka en cada microservicio, diseñamos un módulo exportable en la librería `common`.

### Diseño del Provider:

Este módulo centraliza la conexión al broker (`syncroboard-kafka:9092`) y define los `clientIds` automáticamente.

```typescript
// libs/common/src/kafka/kafka.module.ts
@Module({
  providers: [
    {
      provide: 'KAFKA_SERVICE',
      useFactory: (configService: ConfigService) => {
        return ClientProxyFactory.create({
          transport: Transport.KAFKA,
          options: {
            client: {
              brokers: [configService.get('KAFKA_BROKER')],
            },
            consumer: {
              groupId: configService.get('KAFKA_GROUP_ID'),
            },
          },
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: ['KAFKA_SERVICE'],
})
export class SharedKafkaModule {}

```

---

## 3. Contratos Compartidos (libs/contracts)

Aquí es donde vive el **Spec** de los eventos. Si el `Ticket Service` cambia la estructura de un ticket, el `Assignment Service` se enterará inmediatamente porque comparten el mismo archivo de contrato.

### Ejemplo de Contrato Unificado:

```typescript
// libs/contracts/src/index.ts
export * from './auth/user-created.event';
export * from './tickets/ticket-created.event';
export * from './tickets/ticket-assigned.event';
export * from './shared/priority.enum';

```

---

## 4. Implementación del Patrón Outbox (Librería Database)

Para cumplir con el requerimiento de resiliencia, diseñamos una entidad base para la tabla `Outbox` que puede ser heredada por cualquier servicio.

1. **Entidad Outbox**: `id, eventType, payload (JSON), status (PENDING/SENT), createdAt`.
2. **Interceptor**: Un interceptor global de NestJS que puede capturar eventos de dominio y guardarlos en la tabla `Outbox` dentro de la misma transacción de la base de datos principal.
3. **Cron Job**: Un proceso ligero en cada microservicio que busca registros `PENDING`, los publica en Kafka y marca como `SENT`.

---

## 5. Resumen de Flujo de Desarrollo (Spec-Driven)

Con esta arquitectura lista, tu flujo para crear una nueva funcionalidad será:

1. **Definir el DTO/Evento** en `libs/contracts`.
2. **Implementar el Productor** en el servicio correspondiente (ej. `Ticket Service`).
3. **Implementar el Consumidor** en el servicio que reacciona (ej. `Assignment Service`).
4. **Actualizar la UI** vía WebSockets mediante el Gateway.

---
