# 📚 SPEC-BACKEND-005: Shared Libraries
## libs/common & libs/contracts

**Versión:** 1.0.0
**Última Actualización:** 2025-12-20
**Estado:** Draft
**Objetivo:** Centralizar código reutilizable y contratos entre microservicios

---

## 1. Estructura de Librerías

```
libs/
├── common/                    # Código reutilizable
│   ├── src/
│   │   ├── kafka/            # KafkaModule, decorators
│   │   ├── redis/            # RedisModule, cache utilities
│   │   ├── database/         # Base entities, TypeORM config
│   │   ├── decorators/       # Custom decorators (@CurrentUser, @Public)
│   │   ├── filters/          # Exception filters
│   │   ├── interceptors/     # Logging, transform interceptors
│   │   ├── guards/           # Shared guards
│   │   ├── pipes/            # Validation pipes
│   │   ├── utils/            # Helper functions
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
│
└── contracts/                 # Interfaces y DTOs compartidos
    ├── src/
    │   ├── auth/
    │   │   ├── enums.ts      # UserRole, AuthProvider
    │   │   ├── dtos/         # LoginDto, RegisterDto
    │   │   └── events/       # UserCreatedEvent
    │   ├── tickets/
    │   │   ├── enums.ts      # TicketStatus, TicketPriority
    │   │   ├── dtos/         # CreateTicketDto, UpdateTicketDto
    │   │   └── events/       # TicketCreatedEvent, TicketAssignedEvent
    │   ├── assignments/
    │   │   └── events/       # WorkloadUpdatedEvent
    │   └── shared/
    │       ├── pagination.dto.ts
    │       ├── response.interface.ts
    │       └── base-event.interface.ts
    ├── package.json
    └── tsconfig.json
```

---

## 2. libs/common

### 2.1 Kafka Module

```typescript
// libs/common/src/kafka/kafka.module.ts

import { Module, DynamicModule } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';

interface KafkaModuleOptions {
  name: string;
  groupId: string;
}

@Module({})
export class SharedKafkaModule {
  static register(options: KafkaModuleOptions): DynamicModule {
    return {
      module: SharedKafkaModule,
      imports: [
        ClientsModule.registerAsync([
          {
            name: options.name,
            useFactory: (configService: ConfigService) => ({
              transport: Transport.KAFKA,
              options: {
                client: {
                  clientId: options.groupId,
                  brokers: configService.get<string>('KAFKA_BROKERS').split(','),
                },
                consumer: {
                  groupId: options.groupId,
                  sessionTimeout: 30000,
                  heartbeatInterval: 3000,
                },
                producer: {
                  allowAutoTopicCreation: false,
                  idempotent: true,
                },
              },
            }),
            inject: [ConfigService],
          },
        ]),
      ],
      exports: [ClientsModule],
    };
  }
}

// Uso en apps/auth-service/src/app.module.ts
@Module({
  imports: [
    SharedKafkaModule.register({
      name: 'KAFKA_CLIENT',
      groupId: 'auth-service-group',
    }),
  ],
})
export class AppModule {}
```

---

### 2.2 Redis Module

```typescript
// libs/common/src/redis/redis.module.ts

import { Module, Global } from '@nestjs/common';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class SharedRedisModule {}

// libs/common/src/redis/redis.service.ts

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: RedisClientType;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    this.client = createClient({
      url: this.configService.get<string>('REDIS_URL'),
    });

    await this.client.connect();
    console.log('Redis connected');
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    await this.client.set(key, value);
  }

  async setex(key: string, seconds: number, value: string): Promise<void> {
    await this.client.setEx(key, seconds, value);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async decr(key: string): Promise<number> {
    return this.client.decr(key);
  }
}
```

---

### 2.3 Database - Outbox Pattern

```typescript
// libs/common/src/database/entities/outbox.entity.ts

import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('outbox_events')
export class OutboxEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  eventType: string;

  @Column()
  aggregateId: string;

  @Column('jsonb')
  payload: Record<string, any>;

  @Column({ default: 'PENDING' })
  status: 'PENDING' | 'SENT' | 'FAILED';

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  sentAt: Date;
}

// libs/common/src/database/outbox/outbox.service.ts

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutboxEvent } from '../entities/outbox.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Inject } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';

@Injectable()
export class OutboxService {
  constructor(
    @InjectRepository(OutboxEvent)
    private outboxRepository: Repository<OutboxEvent>,
    @Inject('KAFKA_CLIENT')
    private kafkaClient: ClientKafka,
  ) {}

  async saveEvent(
    eventType: string,
    aggregateId: string,
    payload: Record<string, any>,
  ): Promise<OutboxEvent> {
    return this.outboxRepository.save({
      eventType,
      aggregateId,
      payload,
      status: 'PENDING',
    });
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async processOutbox() {
    const pendingEvents = await this.outboxRepository.find({
      where: { status: 'PENDING' },
      take: 100,
      order: { createdAt: 'ASC' },
    });

    for (const event of pendingEvents) {
      try {
        await this.kafkaClient
          .emit(event.eventType, {
            eventId: event.id,
            eventType: event.eventType,
            timestamp: event.createdAt.toISOString(),
            payload: event.payload,
          })
          .toPromise();

        event.status = 'SENT';
        event.sentAt = new Date();
        await this.outboxRepository.save(event);
      } catch (error) {
        console.error(`Failed to send event ${event.id}:`, error);
        event.status = 'FAILED';
        await this.outboxRepository.save(event);
      }
    }
  }
}
```

---

### 2.4 Decorators

```typescript
// libs/common/src/decorators/current-user.decorator.ts

import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    return data ? user?.[data] : user;
  },
);

// Uso
@Get('profile')
async getProfile(@CurrentUser('sub') userId: string) {
  return this.userService.findById(userId);
}

// libs/common/src/decorators/public.decorator.ts

import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// Uso para endpoints sin autenticación
@Post('login')
@Public()
async login(@Body() dto: LoginDto) {
  // ...
}

// libs/common/src/decorators/roles.decorator.ts

import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@app/contracts/auth/enums';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

// Uso
@Delete('users/:id')
@Roles(UserRole.ADMIN)
async deleteUser(@Param('id') id: string) {
  // ...
}
```

---

### 2.5 Filters

```typescript
// libs/common/src/filters/http-exception.filter.ts

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    };

    console.error('Exception:', errorResponse);

    response.status(status).json(errorResponse);
  }
}
```

---

### 2.6 Interceptors

```typescript
// libs/common/src/interceptors/logging.interceptor.ts

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;
    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startTime;
        console.log(`${method} ${url} - ${duration}ms`);
      }),
    );
  }
}

// libs/common/src/interceptors/transform.interceptor.ts

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, Response<T>> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    return next.handle().pipe(
      map((data) => ({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
```

---

### 2.7 Utils

```typescript
// libs/common/src/utils/hash.util.ts

import * as argon2 from 'argon2';

export class HashUtil {
  static async hash(plain: string): Promise<string> {
    return argon2.hash(plain, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  }

  static async verify(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain);
  }
}

// libs/common/src/utils/date.util.ts

export class DateUtil {
  static addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  static addMinutes(date: Date, minutes: number): Date {
    const result = new Date(date);
    result.setMinutes(result.getMinutes() + minutes);
    return result;
  }

  static isExpired(date: Date): boolean {
    return date.getTime() < Date.now();
  }
}
```

---

## 3. libs/contracts

### 3.1 Base Interfaces

```typescript
// libs/contracts/src/shared/base-event.interface.ts

export interface BaseEvent<T = any> {
  eventId: string;
  eventType: string;
  timestamp: string;
  payload: T;
}

// libs/contracts/src/shared/pagination.dto.ts

import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// libs/contracts/src/shared/response.interface.ts

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  timestamp: string;
}
```

---

### 3.2 Auth Contracts

```typescript
// libs/contracts/src/auth/enums.ts

export enum UserRole {
  ADMIN = 'ADMIN',
  PROJECT_MANAGER = 'PROJECT_MANAGER',
  DEVELOPER = 'DEVELOPER',
  VIEWER = 'VIEWER',
}

export enum AuthProvider {
  LOCAL = 'LOCAL',
  GOOGLE = 'GOOGLE',
}

// libs/contracts/src/auth/events/user-created.event.ts

import { BaseEvent } from '../../shared/base-event.interface';
import { UserRole, AuthProvider } from '../enums';

export interface UserCreatedPayload {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: UserRole[];
  provider: AuthProvider;
}

export type UserCreatedEvent = BaseEvent<UserCreatedPayload>;
```

---

### 3.3 Tickets Contracts

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

// libs/contracts/src/tickets/events/ticket-created.event.ts

import { BaseEvent } from '../../shared/base-event.interface';
import { TicketPriority } from '../enums';

export interface TicketCreatedPayload {
  ticketId: string;
  projectId: string;
  reporterId: string;
  title: string;
  priority: TicketPriority;
}

export type TicketCreatedEvent = BaseEvent<TicketCreatedPayload>;

// libs/contracts/src/tickets/events/ticket-assigned.event.ts

import { BaseEvent } from '../../shared/base-event.interface';

export interface TicketAssignedPayload {
  ticketId: string;
  projectId: string;
  assigneeId: string;
  assignedAt: string;
}

export type TicketAssignedEvent = BaseEvent<TicketAssignedPayload>;

// libs/contracts/src/tickets/events/ticket-status-updated.event.ts

import { BaseEvent } from '../../shared/base-event.interface';
import { TicketStatus } from '../enums';

export interface TicketStatusUpdatedPayload {
  ticketId: string;
  projectId: string;
  oldStatus: TicketStatus;
  newStatus: TicketStatus;
  updatedBy: string;
}

export type TicketStatusUpdatedEvent = BaseEvent<TicketStatusUpdatedPayload>;
```

---

### 3.4 Index Exports

```typescript
// libs/contracts/src/index.ts

// Auth
export * from './auth/enums';
export * from './auth/events/user-created.event';

// Tickets
export * from './tickets/enums';
export * from './tickets/events/ticket-created.event';
export * from './tickets/events/ticket-assigned.event';
export * from './tickets/events/ticket-status-updated.event';

// Shared
export * from './shared/base-event.interface';
export * from './shared/pagination.dto';
export * from './shared/response.interface';
```

---

## 4. Configuración de Nx

### 4.1 tsconfig.json (Root)

```json
{
  "compilerOptions": {
    "paths": {
      "@app/common": ["libs/common/src/index.ts"],
      "@app/common/*": ["libs/common/src/*"],
      "@app/contracts": ["libs/contracts/src/index.ts"],
      "@app/contracts/*": ["libs/contracts/src/*"]
    }
  }
}
```

### 4.2 Uso en Apps

```typescript
// apps/auth-service/src/auth/auth.service.ts

import { UserCreatedEvent, UserRole, AuthProvider } from '@app/contracts';
import { HashUtil } from '@app/common/utils/hash.util';
import { RedisService } from '@app/common/redis/redis.service';

@Injectable()
export class AuthService {
  constructor(
    private redisService: RedisService,
  ) {}

  async register(dto: RegisterDto): Promise<UserCreatedEvent['payload']> {
    const hashedPassword = await HashUtil.hash(dto.password);
    // ...
  }
}
```

---

## 5. Testing de Librerías

```typescript
// libs/common/src/redis/redis.service.spec.ts

describe('RedisService', () => {
  let service: RedisService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('redis://localhost:6379'),
          },
        },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
  });

  it('should set and get value', async () => {
    await service.set('test', 'value');
    const result = await service.get('test');
    expect(result).toBe('value');
  });
});
```

---

## 6. Versionado de Contratos

### Principios:
1. **Backward Compatibility:** Nunca romper contratos existentes
2. **Additive Changes:** Solo agregar campos opcionales
3. **Deprecation:** Marcar campos obsoletos antes de removerlos

```typescript
// ✅ BIEN: Agregar campo opcional
export interface UserCreatedPayload {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: UserRole[];
  provider: AuthProvider;
  avatarUrl?: string;  // Nuevo campo opcional
}

// ❌ MAL: Remover campo existente
export interface UserCreatedPayload {
  userId: string;
  // email: string;  // NO HACER ESTO
}
```

---

**Changelog:**

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0.0 | 2025-12-20 | Especificación inicial |
