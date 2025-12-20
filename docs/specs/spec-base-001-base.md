
## 1. Arquitectura del Sistema

En un entorno de microservicios, la clave es la **separación de responsabilidades** y la **comunicación asíncrona** para procesos pesados.

### Microservicios Propuestos:

1. **API Gateway:** Punto de entrada único (Proxy).
2. **Auth Service:** Gestión de usuarios, roles y JWT.
3. **Project/Ticket Service:** Lógica de negocio de tableros, estados y tickets.
4. **Assignment Service:** Lógica de asignación y carga de trabajo de usuarios.
5. **Notification Service:** Envío de alertas (Email/Push) consumiendo eventos de Kafka.

---

## 2. Estructura del Monorepo (NestJS + Nx)

NestJS tiene soporte nativo para monorepos, pero usar carpetas claras es vital para Docker.

```text
/jira-clone
├── apps/
│   ├── auth-service/          # NestJS
│   ├── ticket-service/        # NestJS
│   ├── notification-service/  # NestJS
│   └── gateway/               # NestJS (Opcional si usas Nginx/Kong)
├── libs/                      # Código compartido
│   ├── common/                # Decoradores, filtros, excepciones
│   ├── contracts/             # Interfaces de Kafka y DTOs compartidos
│   └── database/              # Configuración de TypeORM/Prisma
├── docker-compose.yml
├── .env
└── package.json

```

---

## 3. Requerimientos Técnicos y Flujo de Datos

### Stack Tecnológico

* **Base de Datos:** PostgreSQL 1 bd por microservicio.
* **Mensajería:** **Kafka** para eventos como `TICKET_CREATED` o `USER_ASSIGNED`.
* **Caché:** **Redis** para sesiones de usuario y para el "Rate Limiting" en el Gateway.
* **ORM:** TypeORM.

### Ejemplo de flujo con Kafka:

1. El `Ticket Service` crea un ticket.
2. Se emite un evento a un tópico de Kafka: `ticket.event.created`.
3. El `Notification Service` escucha ese tópico y envía un correo al responsable.

---

## 4. Configuración de Infraestructura (Docker Compose)

Este archivo levantará todo el ecosistema necesario para que tus microservicios se comuniquen.

```yaml
services:
  postgres:
    image: postgres:15-alpine
    container_name: syncroboard-db
    environment:
      - POSTGRES_USER=admin
      - POSTGRES_PASSWORD=securepassword123
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      # Script inline para crear las 3 DBs al iniciar
      - ./init-multiple-databases.sh:/docker-entrypoint-initdb.d/init-multiple-databases.sh
    networks:
      - syncro-network

  redis:
    image: redis:alpine
    ports:
      - "6379:6379"

  zookeeper:
    image: bitnami/zookeeper:latest
    environment:
      - ALLOW_ANONYMOUS_LOGIN=yes

  kafka:
    image: bitnami/kafka:latest
    ports:
      - "9092:9092"
    environment:
      - KAFKA_CFG_ZOOKEEPER_CONNECT=zookeeper:2181
      - ALLOW_ANONYMOUS_LOGIN=yes
    depends_on:
      - zookeeper

  # Los servicios de NestJS se agregarían aquí apuntando a sus respectivos Dockerfiles

```

```bash
#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
CREATE DATABASE syncro_auth_db;
CREATE DATABASE syncro_ticket_db;
CREATE DATABASE syncro_assign_db;
EOSQL
```


---

## 5. Próximos Pasos Recomendados

Para que este proyecto destaque, te sugiero implementar:

1. **Patrón Outbox:** Asegura que el ticket se guarde en la DB y el mensaje de Kafka se envíe de forma atómica.
2. **WebSockets:** Usa Redis Adapter en NestJS para que, cuando un ticket cambie de estado, todos los usuarios viendo el tablero lo vean moverse en tiempo real.
3. **Shared Library:** Crea una librería en `/libs` para manejar la conectividad de Kafka, así no repites la configuración del cliente en cada microservicio.
