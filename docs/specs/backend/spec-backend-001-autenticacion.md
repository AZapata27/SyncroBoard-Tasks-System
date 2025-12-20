Para avanzar con el **Spec-Driven Development**, vamos a formalizar la **Especificación de Requerimientos Técnicos para el Auth Service (Fase 1)**. Este documento servirá como la "única fuente de verdad" para que cualquier desarrollador pueda implementar el servicio siguiendo el estándar de **SyncroBoard**.

---

# Spec-002: Auth Service & Identity Management

## 1. Objetivo

Proveer un sistema centralizado de gestión de identidad que soporte autenticación híbrida (Local y Google OAuth2) y autorice peticiones mediante JWT en todo el sistema de microservicios.

---

## 2. Flujos de Trabajo (Workflows)

### 2.1 Autenticación con Google (Provisionamiento Automático)

1. El **Gateway** recibe el `id_token` de Google.
2. El **Auth Service** valida el token con `google-auth-library`.
3. Si el usuario no existe en `syncro_auth_db`:
* Se crea el registro con `provider: GOOGLE`.
* Se emite el evento Kafka `user.created`.


4. Se generan y retornan `accessToken` y `refreshToken`.

### 2.2 Validación de Sesión (API Gateway)

1. El Gateway intercepta la petición.
2. Verifica la firma del JWT.
3. Consulta en **Redis** si el token está en la lista negra (Blacklist).
4. Si es válido, inyecta `x-user-id` y `x-user-roles` en los headers hacia los servicios internos.

---

## 3. Contratos de Datos (Schema & Events)

### 3.1 Entidad de Usuario (`syncro_auth_db`)

| Campo | Tipo | Restricción |
| --- | --- | --- |
| `id` | UUID | Primary Key (Generated) |
| `email` | String | Unique, Indexed |
| `password_hash` | String | Nullable (para usuarios Google) |
| `provider` | Enum | `LOCAL`, `GOOGLE` |
| `roles` | Array/Enum | Default: `['USER']` |
| `avatar_url` | String | Nullable |

### 3.2 Evento Kafka: `user.created`

Este contrato se define en `libs/contracts` para ser consumido por el **Assignment Service**.

```typescript
export interface UserCreatedPayload {
  userId: string;     // UUID interno
  email: string;      
  firstName: string;
  lastName: string;
  role: string;       // Rol inicial asignado
  source: 'GOOGLE' | 'LOCAL';
}

```

---

## 4. Endpoints de la API (Gateway Proxy)

| Método | Ruta | Microservicio | Descripción |
| --- | --- | --- | --- |
| `POST` | `/auth/google` | Auth | Valida token de Google e inicia sesión. |
| `POST` | `/auth/login` | Auth | Autenticación tradicional (email/pass). |
| `POST` | `/auth/refresh` | Auth | Intercambia Refresh Token por nuevo Access Token. |
| `POST` | `/auth/logout` | Auth | Invalida el Refresh Token en Redis y añade Access Token a Blacklist. |

---

## 5. Requerimientos Técnicos y Seguridad

* **Hashing:** Uso de `argon2` para contraseñas locales.
* **JWT Storage:** Los Access Tokens no deben tener una duración mayor a 15 minutos.
* **Redis Cache:** Los Refresh Tokens se almacenan con un TTL (Time-To-Live) de 7 días vinculado al ID del usuario.
* **Kafka Producer:** El servicio debe implementar el patrón **Transactional Outbox** para asegurar que el usuario se guarda y el evento se envía.

---