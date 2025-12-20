

## Diseño del Dockerfile (Concepto de "Build Once, Deploy Many")

El diseño se divide en 4 etapas estratégicas para maximizar la caché de capas de Docker y reducir el tiempo de construcción.

### Etapa 1: Base (Instalación de dependencias)

* **Objetivo:** Instalar `node_modules` basándose solo en los archivos de bloqueo (`package-lock.json` o `yarn.lock`).
* **Optimización:** Al copiar solo los archivos de dependencias primero, Docker cachea esta capa. Si no cambias el `package.json`, esta etapa se salta en futuras construcciones.

### Etapa 2: Builder (Compilación del Monorepo)

* **Objetivo:** Copiar todo el código fuente del monorepo (incluyendo `libs/common`, `libs/contracts` y `apps/`).
* **Acción:** Ejecutar el comando de compilación específico para el microservicio (ej. `nx build auth-service`).
* **Resultado:** Genera una carpeta `dist/apps/nombre-del-servicio` lista para ejecución.

### Etapa 3: Pruning (Limpieza de dependencias)

* **Objetivo:** Eliminar todas las `devDependencies` (como compiladores de TS, Jest, Nx) que no se necesitan para correr la app.
* **Resultado:** Una carpeta `node_modules` reducida, optimizando el peso de la imagen final.

### Etapa 4: Runner (Imagen de Producción)

* **Objetivo:** Crear una imagen ultra ligera (usando `node:20-alpine`).
* **Contenido:** 1. Solo la carpeta `dist/` del microservicio compilado.
2. Los `node_modules` de producción.
* **Seguridad:** El proceso no debe correr como `root` por seguridad.

---

## Esquema Lógico del Dockerfile

Este es el esqueleto que debe seguir tu implementación:

```dockerfile
# ETAPA 1: Dependencias
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ETAPA 2: Compilación
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY .. .
# Argumento para saber qué app compilar (inyectado por docker-compose)
ARG APP_NAME
RUN npx nx build ${APP_NAME} --prod

# ETAPA 3: Dependencias de producción
FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ETAPA 4: Imagen Final
FROM node:20-alpine AS runner
WORKDIR /app
# Crear usuario no privilegiado
RUN addgroup -S syncro && adduser -S syncro -G syncro

# Copiar solo lo estrictamente necesario
ARG APP_NAME
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist/apps/${APP_NAME} ./dist

USER syncro
CMD ["node", "dist/main.js"]

```

---

## Integración con `docker-compose.yml`

Para que este diseño funcione con tus múltiples microservicios, el `docker-compose.yml` debe pasar el nombre de la aplicación como argumento:

```yaml
services:
  auth-service:
    build:
      context: .
      dockerfile: ./infra/docker/Dockerfile
      args:
        - APP_NAME=auth-service # Esto le dice al Builder qué compilar
    environment:
      - DATABASE_URL=postgresql://admin:securepassword123@postgres:5432/syncro_auth_db
    depends_on:
      - postgres
      - kafka

```