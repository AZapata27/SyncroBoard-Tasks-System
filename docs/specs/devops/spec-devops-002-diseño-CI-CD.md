

## 1. Estrategia de CI/CD para Monorepo

Dado que usas Nx, aprovecharemos su capacidad de **"Affected"**. Esto significa que si solo cambias el código en `auth-service`, GitHub Actions no perderá tiempo compilando el `ticket-service`.

### Fases del Pipeline:

1. **Integración Continua (CI):**
* **Lint & Format:** Asegura que el código siga las reglas de estilo.
* **Tests:** Ejecuta pruebas unitarias y de integración.
* **Build:** Valida que el proyecto compile correctamente.


2. **Despliegue Continuo (CD):**
* **Docker Build:** Crea la imagen usando el Dockerfile multietapa.
* **Push:** Sube la imagen a un registro (GitHub Packages o Docker Hub).



---

## 2. GitHub Actions Workflow (`.github/workflows/main.yml`)

Este script automatiza la validación y el empaquetado de tus microservicios.

```yaml
name: SyncroBoard CI/CD

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Necesario para que Nx detecte cambios entre commits

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      # Nx solo ejecuta comandos en los proyectos afectados por el cambio actual
      - name: Lint Affected
        run: npx nx affected --target=lint

      - name: Test Affected
        run: npx nx affected --target=test

      - name: Build Affected
        run: npx nx affected --target=build

  deploy:
    needs: build-and-test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to DockerHub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      # Ejemplo para desplegar dinámicamente el servicio afectado
      # En un entorno real, usarías un script para iterar sobre los servicios afectados
      - name: Build and Push Auth Service
        run: |
          docker build -t ${{ secrets.DOCKERHUB_USERNAME }}/syncro-auth:latest \
            --build-arg APP_NAME=auth-service \
            -f ./infra/docker/Dockerfile .
          docker push ${{ secrets.DOCKERHUB_USERNAME }}/syncro-auth:latest

```

---

## 3. Optimizaciones Clave en el Script

* **`fetch-depth: 0`**: Nx necesita la historia completa de Git para comparar la rama actual con la base y determinar qué archivos cambiaron.
* **`npx nx affected`**: Esta es la joya de la corona. Si cambias algo en `libs/common`, Nx detectará que TODOS los servicios deben ser probados y compilados. Si solo cambias `notification-service`, solo ese se procesará.
* **Secrets**: El uso de `${{ secrets.DOCKERHUB_TOKEN }}` asegura que tus credenciales de infraestructura nunca estén expuestas en el código.

---
