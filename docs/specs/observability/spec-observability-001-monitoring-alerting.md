# 📊 SPEC-OBSERVABILITY-001: Monitoring & Alerting
## Prometheus, Grafana, ELK Stack & Distributed Tracing

**Versión:** 1.0.0
**Última Actualización:** 2025-12-20
**Estado:** Draft
**Stack:** Prometheus, Grafana, Loki, Tempo, OpenTelemetry

---

## 1. Pilares de Observabilidad

### 1.1 Los Tres Pilares

```
┌──────────────────────────────────────────────┐
│          OBSERVABILIDAD COMPLETA             │
├──────────────────────────────────────────────┤
│                                              │
│  ┌────────────┐  ┌────────────┐  ┌────────┐│
│  │  METRICS   │  │    LOGS    │  │ TRACES ││
│  │            │  │            │  │        ││
│  │ Prometheus │  │    Loki    │  │ Tempo  ││
│  │  + Grafana │  │  + Grafana │  │+ Jaeger││
│  └────────────┘  └────────────┘  └────────┘│
│                                              │
│         OpenTelemetry (Collector)            │
└──────────────────────────────────────────────┘
```

---

## 2. Metrics (Prometheus + Grafana)

### 2.1 Prometheus Setup

```yaml
# docker-compose.observability.yml

version: '3.9'

services:
  prometheus:
    image: prom/prometheus:latest
    container_name: syncro-prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./observability/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=30d'
      - '--web.enable-lifecycle'
    networks:
      - syncro-network

  grafana:
    image: grafana/grafana:latest
    container_name: syncro-grafana
    ports:
      - "3030:3000"
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
    volumes:
      - grafana_data:/var/lib/grafana
      - ./observability/grafana/provisioning:/etc/grafana/provisioning
      - ./observability/grafana/dashboards:/var/lib/grafana/dashboards
    networks:
      - syncro-network

volumes:
  prometheus_data:
  grafana_data:
```

### 2.2 Prometheus Configuration

```yaml
# observability/prometheus/prometheus.yml

global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: 'syncroboard-prod'
    environment: 'production'

# Alertmanager configuration
alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

# Load rules once and periodically evaluate them
rule_files:
  - 'alerts/*.yml'

scrape_configs:
  # Gateway
  - job_name: 'gateway'
    static_configs:
      - targets: ['gateway:3000']
    metrics_path: '/metrics'

  # Auth Service
  - job_name: 'auth-service'
    static_configs:
      - targets: ['auth-service:3001']
    metrics_path: '/metrics'

  # Ticket Service
  - job_name: 'ticket-service'
    static_configs:
      - targets: ['ticket-service:3002']
    metrics_path: '/metrics'

  # Assignment Service
  - job_name: 'assignment-service'
    static_configs:
      - targets: ['assignment-service:3003']
    metrics_path: '/metrics'

  # Notification Service
  - job_name: 'notification-service'
    static_configs:
      - targets: ['notification-service:3004']
    metrics_path: '/metrics'

  # Infrastructure
  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']

  - job_name: 'kafka'
    static_configs:
      - targets: ['kafka-exporter:9308']

  # Node exporter (system metrics)
  - job_name: 'node'
    static_configs:
      - targets: ['node-exporter:9100']
```

### 2.3 NestJS Metrics Integration

```typescript
// libs/common/src/monitoring/prometheus.module.ts

import { Module } from '@nestjs/common';
import { PrometheusModule as BasePrometheusModule } from '@willsoto/nestjs-prometheus';
import { PrometheusService } from './prometheus.service';

@Module({
  imports: [
    BasePrometheusModule.register({
      path: '/metrics',
      defaultMetrics: {
        enabled: true,
        config: {
          prefix: 'syncroboard_',
        },
      },
    }),
  ],
  providers: [PrometheusService],
  exports: [PrometheusService],
})
export class PrometheusConfigModule {}
```

```typescript
// libs/common/src/monitoring/prometheus.service.ts

import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Gauge, Registry } from 'prom-client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';

@Injectable()
export class PrometheusService {
  constructor(
    @InjectMetric('http_requests_total')
    public httpRequestsTotal: Counter<string>,

    @InjectMetric('http_request_duration_seconds')
    public httpRequestDuration: Histogram<string>,

    @InjectMetric('active_connections')
    public activeConnections: Gauge<string>,
  ) {}

  // Custom metrics
  recordHttpRequest(method: string, route: string, statusCode: number, duration: number) {
    this.httpRequestsTotal.inc({
      method,
      route,
      status_code: statusCode,
    });

    this.httpRequestDuration.observe(
      {
        method,
        route,
      },
      duration / 1000 // Convert to seconds
    );
  }

  setActiveConnections(count: number) {
    this.activeConnections.set(count);
  }
}
```

### 2.4 Métricas Personalizadas por Servicio

```typescript
// apps/auth-service/src/metrics.ts

import { makeCounterProvider, makeHistogramProvider } from '@willsoto/nestjs-prometheus';

export const authMetrics = [
  makeCounterProvider({
    name: 'auth_login_attempts_total',
    help: 'Total number of login attempts',
    labelNames: ['provider', 'status'],
  }),
  makeCounterProvider({
    name: 'auth_registrations_total',
    help: 'Total number of user registrations',
    labelNames: ['provider'],
  }),
  makeHistogramProvider({
    name: 'auth_token_generation_duration',
    help: 'Time to generate JWT tokens',
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  }),
  makeCounterProvider({
    name: 'auth_token_refresh_total',
    help: 'Total number of token refreshes',
  }),
];

// apps/ticket-service/src/metrics.ts

export const ticketMetrics = [
  makeCounterProvider({
    name: 'tickets_created_total',
    help: 'Total tickets created',
    labelNames: ['project_id', 'priority'],
  }),
  makeCounterProvider({
    name: 'tickets_status_changed_total',
    help: 'Total ticket status changes',
    labelNames: ['from_status', 'to_status'],
  }),
  makeGaugeProvider({
    name: 'tickets_open_count',
    help: 'Current number of open tickets',
    labelNames: ['project_id'],
  }),
  makeHistogramProvider({
    name: 'ticket_assignment_duration',
    help: 'Time from ticket creation to assignment',
    buckets: [1, 5, 10, 30, 60, 300],
  }),
];
```

### 2.5 Grafana Dashboards

```json
// observability/grafana/dashboards/overview.json

{
  "dashboard": {
    "title": "SyncroBoard - Overview",
    "panels": [
      {
        "title": "Request Rate (req/s)",
        "targets": [
          {
            "expr": "sum(rate(syncroboard_http_requests_total[5m])) by (job)"
          }
        ],
        "type": "graph"
      },
      {
        "title": "Response Time (p95)",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, sum(rate(syncroboard_http_request_duration_seconds_bucket[5m])) by (le, job))"
          }
        ],
        "type": "graph"
      },
      {
        "title": "Error Rate (%)",
        "targets": [
          {
            "expr": "sum(rate(syncroboard_http_requests_total{status_code=~\"5..\"}[5m])) / sum(rate(syncroboard_http_requests_total[5m])) * 100"
          }
        ],
        "type": "graph"
      },
      {
        "title": "Active Users",
        "targets": [
          {
            "expr": "syncroboard_active_connections{job=\"gateway\"}"
          }
        ],
        "type": "stat"
      }
    ]
  }
}
```

---

## 3. Logs (Loki + Grafana)

### 3.1 Loki Setup

```yaml
# docker-compose.observability.yml (continuar)

  loki:
    image: grafana/loki:latest
    container_name: syncro-loki
    ports:
      - "3100:3100"
    volumes:
      - ./observability/loki/loki-config.yml:/etc/loki/loki-config.yml
      - loki_data:/loki
    command: -config.file=/etc/loki/loki-config.yml
    networks:
      - syncro-network

  promtail:
    image: grafana/promtail:latest
    container_name: syncro-promtail
    volumes:
      - ./observability/promtail/promtail-config.yml:/etc/promtail/promtail-config.yml
      - /var/log:/var/log
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
    command: -config.file=/etc/promtail/promtail-config.yml
    networks:
      - syncro-network
```

### 3.2 Structured Logging en NestJS

```typescript
// libs/common/src/logging/logger.service.ts

import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import * as winston from 'winston';
import { ElasticsearchTransport } from 'winston-elasticsearch';

@Injectable()
export class LoggerService implements NestLoggerService {
  private logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: {
        service: process.env.SERVICE_NAME,
        environment: process.env.NODE_ENV,
        version: process.env.APP_VERSION || '1.0.0',
      },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              return `${timestamp} [${level}]: ${message} ${
                Object.keys(meta).length ? JSON.stringify(meta) : ''
              }`;
            })
          ),
        }),
        // Loki transport (via HTTP)
        new winston.transports.Http({
          host: process.env.LOKI_HOST || 'loki',
          port: parseInt(process.env.LOKI_PORT || '3100'),
          path: '/loki/api/v1/push',
        }),
      ],
    });
  }

  log(message: string, context?: string, meta?: any) {
    this.logger.info(message, { context, ...meta });
  }

  error(message: string, trace?: string, context?: string, meta?: any) {
    this.logger.error(message, { context, trace, ...meta });
  }

  warn(message: string, context?: string, meta?: any) {
    this.logger.warn(message, { context, ...meta });
  }

  debug(message: string, context?: string, meta?: any) {
    this.logger.debug(message, { context, ...meta });
  }

  verbose(message: string, context?: string, meta?: any) {
    this.logger.verbose(message, { context, ...meta });
  }
}
```

### 3.3 Correlation IDs (Request Tracing)

```typescript
// libs/common/src/middleware/correlation-id.middleware.ts

import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const correlationId = req.headers['x-correlation-id'] || uuidv4();

    req.headers['x-correlation-id'] = correlationId as string;
    res.setHeader('x-correlation-id', correlationId);

    // Attach to request for logging
    req['correlationId'] = correlationId;

    next();
  }
}

// Usar en logging
logger.log('User created', 'AuthService', {
  correlationId: req.correlationId,
  userId: user.id,
  email: user.email,
});
```

---

## 4. Distributed Tracing (Tempo + OpenTelemetry)

### 4.1 OpenTelemetry Setup

```typescript
// libs/common/src/tracing/tracing.ts

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

export function initTracing(serviceName: string) {
  const traceExporter = new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://tempo:4318/v1/traces',
  });

  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: process.env.APP_VERSION || '1.0.0',
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
    }),
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-express': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-pg': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-redis': {
          enabled: true,
        },
      }),
    ],
  });

  sdk.start();

  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => console.log('Tracing terminated'))
      .catch((error) => console.log('Error terminating tracing', error))
      .finally(() => process.exit(0));
  });
}

// En main.ts de cada servicio
import { initTracing } from '@app/common/tracing/tracing';

initTracing('auth-service'); // o 'ticket-service', etc.
```

### 4.2 Custom Spans

```typescript
// libs/common/src/tracing/tracer.service.ts

import { Injectable } from '@nestjs/common';
import { trace, context, Span, SpanStatusCode } from '@opentelemetry/api';

@Injectable()
export class TracerService {
  private tracer = trace.getTracer('syncroboard', '1.0.0');

  async traceAsync<T>(
    spanName: string,
    fn: (span: Span) => Promise<T>,
    attributes?: Record<string, any>
  ): Promise<T> {
    return this.tracer.startActiveSpan(spanName, async (span) => {
      try {
        if (attributes) {
          span.setAttributes(attributes);
        }

        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
        span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  addEvent(name: string, attributes?: Record<string, any>) {
    const span = trace.getActiveSpan();
    if (span) {
      span.addEvent(name, attributes);
    }
  }
}

// Uso
async createTicket(dto: CreateTicketDto) {
  return this.tracerService.traceAsync(
    'ticket.create',
    async (span) => {
      span.setAttribute('ticket.project_id', dto.projectId);
      span.setAttribute('ticket.priority', dto.priority);

      const ticket = await this.ticketRepository.save(dto);

      this.tracerService.addEvent('ticket.saved', {
        ticketId: ticket.id,
      });

      await this.publishEvent('ticket.created', ticket);

      return ticket;
    }
  );
}
```

---

## 5. Alerting (AlertManager)

### 5.1 AlertManager Configuration

```yaml
# observability/alertmanager/alertmanager.yml

global:
  resolve_timeout: 5m
  slack_api_url: ${SLACK_WEBHOOK_URL}

route:
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  receiver: 'slack-notifications'
  routes:
    - match:
        severity: critical
      receiver: 'pagerduty'
    - match:
        severity: warning
      receiver: 'slack-notifications'

receivers:
  - name: 'slack-notifications'
    slack_configs:
      - channel: '#syncroboard-alerts'
        title: 'Alert: {{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'

  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: ${PAGERDUTY_SERVICE_KEY}
```

### 5.2 Alert Rules

```yaml
# observability/prometheus/alerts/app-alerts.yml

groups:
  - name: application
    interval: 30s
    rules:
      # High error rate
      - alert: HighErrorRate
        expr: |
          sum(rate(syncroboard_http_requests_total{status_code=~"5.."}[5m])) by (job)
          / sum(rate(syncroboard_http_requests_total[5m])) by (job) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate on {{ $labels.job }}"
          description: "Error rate is {{ $value | humanizePercentage }} on {{ $labels.job }}"

      # High response time
      - alert: HighResponseTime
        expr: |
          histogram_quantile(0.95,
            sum(rate(syncroboard_http_request_duration_seconds_bucket[5m])) by (le, job)
          ) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High response time on {{ $labels.job }}"
          description: "95th percentile response time is {{ $value }}s on {{ $labels.job }}"

      # Service down
      - alert: ServiceDown
        expr: up{job=~".*-service"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Service {{ $labels.job }} is down"
          description: "{{ $labels.job }} has been down for more than 1 minute"

      # Database connection pool exhaustion
      - alert: DatabasePoolExhaustion
        expr: |
          syncroboard_database_connections_active
          / syncroboard_database_connections_max > 0.9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Database connection pool nearly exhausted"
          description: "{{ $labels.job }} is using {{ $value | humanizePercentage }} of connection pool"

      # Kafka consumer lag
      - alert: HighKafkaConsumerLag
        expr: kafka_consumer_lag_sum > 1000
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High Kafka consumer lag"
          description: "Consumer group {{ $labels.consumer_group }} has lag of {{ $value }}"

      # Memory usage
      - alert: HighMemoryUsage
        expr: |
          (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes)
          / node_memory_MemTotal_bytes > 0.85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage"
          description: "Memory usage is {{ $value | humanizePercentage }}"

      # Disk usage
      - alert: HighDiskUsage
        expr: |
          (node_filesystem_size_bytes - node_filesystem_avail_bytes)
          / node_filesystem_size_bytes > 0.85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High disk usage on {{ $labels.device }}"
          description: "Disk usage is {{ $value | humanizePercentage }}"
```

---

## 6. Health Checks

### 6.1 Advanced Health Check

```typescript
// libs/common/src/health/health.controller.ts

import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator,
         DiskHealthIndicator, MemoryHealthIndicator } from '@nestjs/terminus';
import { RedisHealthIndicator } from './redis.health';
import { KafkaHealthIndicator } from './kafka.health';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private redis: RedisHealthIndicator,
    private kafka: KafkaHealthIndicator,
    private disk: DiskHealthIndicator,
    private memory: MemoryHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.redis.pingCheck('redis'),
      () => this.kafka.pingCheck('kafka'),
      () => this.disk.checkStorage('storage', { path: '/', thresholdPercent: 0.9 }),
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
      () => this.memory.checkRSS('memory_rss', 500 * 1024 * 1024),
    ]);
  }

  @Get('ready')
  @HealthCheck()
  ready() {
    // Readiness probe - can service handle requests?
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.redis.pingCheck('redis'),
    ]);
  }

  @Get('live')
  @HealthCheck()
  live() {
    // Liveness probe - is service alive?
    return { status: 'ok' };
  }
}
```

---

## 7. Dashboard Examples

### 7.1 Service-Level Dashboard (Auth Service)

```json
{
  "dashboard": {
    "title": "Auth Service - Detailed",
    "panels": [
      {
        "title": "Login Attempts",
        "targets": [{
          "expr": "sum(rate(auth_login_attempts_total[5m])) by (provider, status)"
        }]
      },
      {
        "title": "Registration Rate",
        "targets": [{
          "expr": "sum(rate(auth_registrations_total[5m])) by (provider)"
        }]
      },
      {
        "title": "Token Generation Time",
        "targets": [{
          "expr": "histogram_quantile(0.95, sum(rate(auth_token_generation_duration_bucket[5m])) by (le))"
        }]
      },
      {
        "title": "Active Sessions",
        "targets": [{
          "expr": "count(redis_key{key=~\"refresh_token:.*\"})"
        }]
      }
    ]
  }
}
```

---

## 8. SLIs, SLOs, SLAs

### 8.1 Service Level Objectives

```yaml
# SLOs Definition

services:
  gateway:
    availability:
      target: 99.9%  # 43.8 minutes downtime/month
    latency:
      p95: 200ms
      p99: 500ms
    error_rate:
      target: 0.1%  # 99.9% success rate

  auth-service:
    availability: 99.95%
    latency:
      p95: 100ms
      p99: 300ms

  ticket-service:
    availability: 99.9%
    latency:
      p95: 200ms
      p99: 500ms
```

### 8.2 SLO Monitoring Query

```promql
# Availability SLO
sum(rate(http_requests_total{status_code!~"5.."}[30d]))
/ sum(rate(http_requests_total[30d]))

# Latency SLO (95th percentile < 200ms)
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
) < 0.2

# Error budget (for 99.9% availability)
1 - (
  sum(rate(http_requests_total{status_code!~"5.."}[30d]))
  / sum(rate(http_requests_total[30d]))
) < 0.001
```

---

## 9. Cost Optimization

### 9.1 Retention Policies

```yaml
# Prometheus retention
prometheus:
  retention: 30d

# Loki retention
loki:
  retention_period: 30d

# Tempo retention
tempo:
  retention: 7d
```

### 9.2 Sampling Strategy

```typescript
// Trace sampling for high-volume endpoints
const sampler = process.env.NODE_ENV === 'production'
  ? new TraceIdRatioBasedSampler(0.1) // 10% sampling
  : new AlwaysOnSampler();
```

---

## 10. Variables de Entorno

```env
# Observability
LOG_LEVEL=info
SERVICE_NAME=auth-service
APP_VERSION=1.0.0

# Prometheus
PROMETHEUS_PORT=9090

# Loki
LOKI_HOST=loki
LOKI_PORT=3100

# Tempo / OpenTelemetry
OTEL_EXPORTER_OTLP_ENDPOINT=http://tempo:4318/v1/traces
OTEL_SERVICE_NAME=auth-service

# Alerting
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx
PAGERDUTY_SERVICE_KEY=xxx
```

---

**Changelog:**

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0.0 | 2025-12-20 | Especificación inicial |
