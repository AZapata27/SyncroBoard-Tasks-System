# Path Aliases Guide

Este documento explica la convención de path aliases (rutas con alias) utilizadas en el proyecto SyncroBoard para mantener imports limpios y estandarizados.

## 🎯 Objetivo

En lugar de usar rutas relativas como:
```typescript
import { AuthModule } from '../../modules/auth/auth.module';
import { JwtAuthGuard } from '../../../guards/jwt-auth.guard';
```

Usamos path aliases limpios y estandarizados:
```typescript
import { AuthModule } from '@gateway/modules/auth/auth.module';
import { JwtAuthGuard } from '@gateway/guards/jwt-auth.guard';
```

## 📋 Path Aliases Configurados

### Librerías Compartidas (Shared Libraries)

```typescript
// Librería común (módulos compartidos)
import { KafkaModule, RedisModule, OutboxService } from '@app/common';
import { LoggingInterceptor } from '@app/common/interceptors/logging.interceptor';
import { JwtAuthGuard } from '@app/common/guards/jwt-auth.guard';

// Contratos compartidos (DTOs, Events, Enums)
import { CreateTicketDto, TicketResponseDto } from '@app/contracts';
import { UserRole, TicketStatus } from '@app/contracts/enums';
import { TicketCreatedEvent } from '@app/contracts/events';
```

### Gateway Service

```typescript
// Módulos del Gateway
import { AuthModule } from '@gateway/modules/auth/auth.module';
import { TicketsModule } from '@gateway/modules/tickets/tickets.module';
import { AssignmentsModule } from '@gateway/modules/assignments/assignments.module';
import { NotificationsModule } from '@gateway/modules/notifications/notifications.module';

// Guards del Gateway
import { JwtAuthGuard } from '@gateway/guards/jwt-auth.guard';
import { JwtStrategy } from '@gateway/guards/jwt.strategy';

// Configuración del Gateway
import { getRedisConfig } from '@gateway/config/redis.config';
```

### Auth Service

```typescript
// Módulos del Auth Service
import { UsersModule } from '@auth/modules/users/users.module';
import { AuthModule } from '@auth/modules/auth/auth.module';

// Configuración del Auth Service
import { getDatabaseConfig } from '@auth/config/database.config';
import { getJwtConfig } from '@auth/config/jwt.config';
```

### Ticket Service

```typescript
// Módulos del Ticket Service
import { TicketsModule } from '@ticket/modules/tickets/tickets.module';
import { CommentsModule } from '@ticket/modules/comments/comments.module';
import { ProjectsModule } from '@ticket/modules/projects/projects.module';

// Configuración del Ticket Service
import { getDatabaseConfig } from '@ticket/config/database.config';
```

### Assignment Service

```typescript
// Módulos del Assignment Service
import { AssignmentsModule } from '@assignment/modules/assignments/assignments.module';

// Configuración del Assignment Service
import { getDatabaseConfig } from '@assignment/config/database.config';
```

### Notification Service

```typescript
// Módulos del Notification Service
import { EventsModule } from '@notification/modules/events/events.module';
```

## 🔧 Configuración en tsconfig.base.json

La configuración de todos los path aliases se encuentra en el archivo raíz `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      // Shared Libraries
      "@app/common": ["libs/common/src/index.ts"],
      "@app/common/*": ["libs/common/src/*"],
      "@app/contracts": ["libs/contracts/src/index.ts"],
      "@app/contracts/*": ["libs/contracts/src/*"],

      // Gateway
      "@gateway/modules/*": ["apps/gateway/src/modules/*"],
      "@gateway/guards/*": ["apps/gateway/src/guards/*"],
      "@gateway/config/*": ["apps/gateway/src/config/*"],

      // Auth Service
      "@auth/modules/*": ["apps/auth-service/src/modules/*"],
      "@auth/config/*": ["apps/auth-service/src/config/*"],

      // Ticket Service
      "@ticket/modules/*": ["apps/ticket-service/src/modules/*"],
      "@ticket/config/*": ["apps/ticket-service/src/config/*"],

      // Assignment Service
      "@assignment/modules/*": ["apps/assignment-service/src/modules/*"],
      "@assignment/config/*": ["apps/assignment-service/src/config/*"],

      // Notification Service
      "@notification/modules/*": ["apps/notification-service/src/modules/*"]
    }
  }
}
```

## 📝 Reglas y Mejores Prácticas

### 1. Siempre usar path aliases para imports entre módulos

❌ **Incorrecto** (rutas relativas):
```typescript
import { AuthModule } from '../../modules/auth/auth.module';
import { UsersService } from '../users/users.service';
```

✅ **Correcto** (path aliases):
```typescript
import { AuthModule } from '@gateway/modules/auth/auth.module';
import { UsersService } from '@auth/modules/users/users.service';
```

### 2. Imports dentro del mismo directorio pueden usar rutas relativas

✅ **Aceptable** (mismo directorio):
```typescript
// En auth.controller.ts
import { AuthService } from './auth.service';
```

✅ **También correcto** (path alias):
```typescript
// En auth.controller.ts
import { AuthService } from '@gateway/modules/auth/auth.service';
```

### 3. Siempre usar path aliases para librerías compartidas

✅ **Correcto**:
```typescript
import { KafkaModule, RedisModule } from '@app/common';
import { CreateTicketDto, TicketStatus } from '@app/contracts';
```

### 4. Orden de imports recomendado

```typescript
// 1. Node modules / Third-party
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// 2. Librerías compartidas del proyecto (@app/*)
import { KafkaModule, RedisModule } from '@app/common';
import { CreateTicketDto } from '@app/contracts';

// 3. Módulos del mismo servicio (@gateway/*, @auth/*, etc.)
import { AuthModule } from '@gateway/modules/auth/auth.module';
import { JwtAuthGuard } from '@gateway/guards/jwt-auth.guard';

// 4. Imports relativos (mismo directorio)
import { AuthService } from './auth.service';
```

## 🆕 Agregar Nuevos Path Aliases

Si necesitas agregar un nuevo path alias:

1. Edita `tsconfig.base.json`
2. Agrega el nuevo path en la sección `paths`:

```json
{
  "paths": {
    // ... existentes ...
    "@new-service/modules/*": ["apps/new-service/src/modules/*"],
    "@new-service/config/*": ["apps/new-service/src/config/*"]
  }
}
```

3. Reinicia el IDE (IntelliJ, VSCode, etc.) para que reconozca los nuevos paths

## 🔍 Verificación en el IDE

### IntelliJ IDEA / WebStorm

El IDE debería reconocer automáticamente los path aliases de `tsconfig.base.json`. Si no los reconoce:

1. File → Invalidate Caches → Invalidate and Restart
2. Verificar que el TypeScript Language Service esté activo

### VSCode

VSCode debería reconocer automáticamente los path aliases. Si no:

1. Cmd/Ctrl + Shift + P → "TypeScript: Restart TS Server"
2. Verificar que tienes instalada la extensión TypeScript

## 🐛 Troubleshooting

### "Cannot find module '@gateway/modules/...'"

**Solución**:
1. Verificar que el path alias está definido en `tsconfig.base.json`
2. Reiniciar el IDE o TypeScript Language Service
3. Verificar que el archivo existe en la ruta especificada

### Los imports funcionan en el IDE pero fallan al compilar

**Solución**:
1. Verificar que `tsconfig.app.json` de cada servicio extiende correctamente `tsconfig.base.json`
2. Verificar que no hay conflictos en la configuración de paths

### Jest no reconoce los path aliases

**Solución**:
Agregar `moduleNameMapper` en `jest.config.ts`:

```typescript
export default {
  // ...
  moduleNameMapper: {
    '^@app/common(.*)$': '<rootDir>/../../libs/common/src$1',
    '^@app/contracts(.*)$': '<rootDir>/../../libs/contracts/src$1',
    '^@gateway/(.*)$': '<rootDir>/src/$1',
  },
};
```

## 📚 Recursos

- [TypeScript Module Resolution](https://www.typescriptlang.org/docs/handbook/module-resolution.html)
- [TypeScript Path Mapping](https://www.typescriptlang.org/docs/handbook/module-resolution.html#path-mapping)
- [NestJS Project Structure](https://docs.nestjs.com/cli/monorepo#project-structure)
- [Nx Path Mapping](https://nx.dev/recipes/tips-n-tricks/define-secondary-entrypoints)

## ✅ Checklist de Migración

Al migrar código existente a usar path aliases:

- [ ] Actualizar imports de módulos
- [ ] Actualizar imports de guards
- [ ] Actualizar imports de configuración
- [ ] Actualizar imports de librerías compartidas
- [ ] Verificar que compila sin errores
- [ ] Verificar que los tests pasan
- [ ] Verificar que el IDE reconoce los imports
