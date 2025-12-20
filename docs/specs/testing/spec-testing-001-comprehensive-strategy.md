# 🧪 SPEC-TESTING-001: Comprehensive Testing Strategy
## Unit, Integration, E2E, Load & Performance Testing

**Versión:** 1.0.0
**Última Actualización:** 2025-12-20
**Estado:** Draft
**Stack:** Jest, Supertest, Playwright, K6, Artillery

---

## 1. Pirámide de Testing

```
           ┌────────┐
           │   E2E  │  ← Manual & Automated (10%)
           │ Tests  │
           └────────┘
          ┌──────────┐
          │Integration│  ← API + DB Tests (20%)
          │   Tests   │
          └──────────┘
       ┌──────────────┐
       │  Unit Tests   │  ← Lógica de negocio (70%)
       └──────────────┘
```

---

## 2. Unit Testing (Jest)

### 2.1 Configuración Base

```typescript
// jest.config.ts (root)

export default {
  projects: [
    '<rootDir>/apps/auth-service',
    '<rootDir>/apps/ticket-service',
    '<rootDir>/apps/assignment-service',
    '<rootDir>/apps/gateway',
    '<rootDir>/apps/notification-service',
    '<rootDir>/libs/common',
    '<rootDir>/libs/contracts',
  ],
  coverageDirectory: '<rootDir>/coverage',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.interface.ts',
    '!src/**/*.dto.ts',
    '!src/main.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
```

### 2.2 Ejemplo: Service Unit Test

```typescript
// apps/auth-service/src/auth/auth.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UserRepository } from './repositories/user.repository';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@app/common';
import { ConflictException, UnauthorizedException } from '@nestjs/common';

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: jest.Mocked<UserRepository>;
  let jwtService: jest.Mocked<JwtService>;
  let redisService: jest.Mocked<RedisService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UserRepository,
          useValue: {
            findByEmail: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
            verify: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            set: jest.fn(),
            get: jest.fn(),
            del: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key) => {
              const config = {
                JWT_ACCESS_EXPIRATION: '15m',
                JWT_REFRESH_EXPIRATION: '7d',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userRepository = module.get(UserRepository);
    jwtService = module.get(JwtService);
    redisService = module.get(RedisService);
  });

  describe('register', () => {
    it('should create a new user', async () => {
      const dto = {
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      userRepository.findByEmail.mockResolvedValue(null);
      userRepository.save.mockResolvedValue({
        id: 'user-123',
        ...dto,
        password_hash: 'hashed',
        provider: 'LOCAL',
      });

      jwtService.sign.mockReturnValue('mock-token');

      const result = await service.register(dto);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe(dto.email);
      expect(userRepository.save).toHaveBeenCalled();
    });

    it('should throw ConflictException if email exists', async () => {
      const dto = {
        email: 'existing@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      userRepository.findByEmail.mockResolvedValue({
        id: 'user-123',
        email: dto.email,
      } as any);

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should return tokens for valid credentials', async () => {
      const dto = {
        email: 'test@example.com',
        password: 'Password123!',
      };

      const user = {
        id: 'user-123',
        email: dto.email,
        password_hash: '$argon2...',
        isActive: true,
      };

      userRepository.findByEmail.mockResolvedValue(user as any);
      jest.spyOn(service as any, 'verifyPassword').mockResolvedValue(true);
      jwtService.sign.mockReturnValue('mock-token');

      const result = await service.login(dto);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      const dto = {
        email: 'test@example.com',
        password: 'WrongPassword',
      };

      userRepository.findByEmail.mockResolvedValue({
        id: 'user-123',
        password_hash: '$argon2...',
      } as any);

      jest.spyOn(service as any, 'verifyPassword').mockResolvedValue(false);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });
  });
});
```

### 2.3 Testing con Mocks

```typescript
// libs/common/src/testing/mock-factory.ts

export class MockFactory {
  static createMockRepository<T>() {
    return {
      find: jest.fn(),
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn(),
        getOne: jest.fn(),
        getCount: jest.fn(),
      })),
    };
  }

  static createMockKafkaClient() {
    return {
      emit: jest.fn().mockReturnValue({ toPromise: jest.fn().mockResolvedValue(true) }),
      send: jest.fn().mockResolvedValue(true),
      subscribeToResponseOf: jest.fn(),
      connect: jest.fn().mockResolvedValue(true),
      close: jest.fn().mockResolvedValue(true),
    };
  }

  static createMockRedisService() {
    return {
      get: jest.fn(),
      set: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      incr: jest.fn(),
      decr: jest.fn(),
    };
  }
}
```

---

## 3. Integration Testing

### 3.1 API Integration Tests

```typescript
// apps/auth-service/test/auth.e2e-spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    dataSource = moduleFixture.get(DataSource);

    await app.init();
  });

  beforeEach(async () => {
    // Clear database before each test
    await dataSource.query('TRUNCATE TABLE users CASCADE');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/auth/register (POST)', () => {
    it('should register a new user', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
          firstName: 'Test',
          lastName: 'User',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('accessToken');
          expect(res.body).toHaveProperty('refreshToken');
          expect(res.body.user.email).toBe('test@example.com');
        });
    });

    it('should return 400 for invalid email', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'invalid-email',
          password: 'Password123!',
          firstName: 'Test',
          lastName: 'User',
        })
        .expect(400);
    });

    it('should return 409 for duplicate email', async () => {
      const user = {
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      // First registration
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(user)
        .expect(201);

      // Second registration (should fail)
      return request(app.getHttpServer())
        .post('/auth/register')
        .send(user)
        .expect(409);
    });
  });

  describe('/auth/login (POST)', () => {
    beforeEach(async () => {
      // Create test user
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
          firstName: 'Test',
          lastName: 'User',
        });
    });

    it('should login with valid credentials', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('accessToken');
          expect(res.body).toHaveProperty('refreshToken');
        });
    });

    it('should return 401 for invalid password', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'WrongPassword',
        })
        .expect(401);
    });
  });

  describe('Protected route flow', () => {
    let accessToken: string;

    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
          firstName: 'Test',
          lastName: 'User',
        });

      accessToken = response.body.accessToken;
    });

    it('should access protected route with valid token', () => {
      return request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.email).toBe('test@example.com');
        });
    });

    it('should return 401 without token', () => {
      return request(app.getHttpServer())
        .get('/auth/me')
        .expect(401);
    });
  });
});
```

### 3.2 Testcontainers para Servicios Externos

```typescript
// apps/ticket-service/test/setup-testcontainers.ts

import { GenericContainer, StartedTestContainer } from 'testcontainers';

export class TestEnvironment {
  static postgresContainer: StartedTestContainer;
  static redisContainer: StartedTestContainer;
  static kafkaContainer: StartedTestContainer;

  static async setup() {
    console.log('Starting test containers...');

    // PostgreSQL
    this.postgresContainer = await new GenericContainer('postgres:15-alpine')
      .withEnvironment({
        POSTGRES_USER: 'test',
        POSTGRES_PASSWORD: 'test',
        POSTGRES_DB: 'test_db',
      })
      .withExposedPorts(5432)
      .start();

    // Redis
    this.redisContainer = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .start();

    // Kafka (using redpanda for testing - lighter than full Kafka)
    this.kafkaContainer = await new GenericContainer('vectorized/redpanda')
      .withCommand([
        'redpanda',
        'start',
        '--smp 1',
        '--memory 1G',
        '--overprovisioned',
        '--node-id 0',
        '--check=false',
      ])
      .withExposedPorts(9092)
      .start();

    // Set environment variables
    process.env.DATABASE_URL = `postgresql://test:test@${this.postgresContainer.getHost()}:${this.postgresContainer.getMappedPort(5432)}/test_db`;
    process.env.REDIS_URL = `redis://${this.redisContainer.getHost()}:${this.redisContainer.getMappedPort(6379)}`;
    process.env.KAFKA_BROKERS = `${this.kafkaContainer.getHost()}:${this.kafkaContainer.getMappedPort(9092)}`;

    console.log('Test containers started!');
  }

  static async teardown() {
    console.log('Stopping test containers...');
    await Promise.all([
      this.postgresContainer?.stop(),
      this.redisContainer?.stop(),
      this.kafkaContainer?.stop(),
    ]);
    console.log('Test containers stopped!');
  }
}

// jest.config.ts
export default {
  globalSetup: '<rootDir>/test/setup-testcontainers.ts',
  globalTeardown: '<rootDir>/test/teardown-testcontainers.ts',
};
```

---

## 4. End-to-End Testing (Playwright)

### 4.1 Configuración Playwright

```typescript
// apps/web/playwright.config.ts

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
  },
});
```

### 4.2 E2E Test Example

```typescript
// apps/web/e2e/ticket-workflow.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Ticket Management Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/projects');
  });

  test('should create and assign a ticket', async ({ page }) => {
    // Navigate to project
    await page.click('text=Test Project');
    await expect(page).toHaveURL(/\/projects\/.*\/board/);

    // Open create ticket modal
    await page.click('button:has-text("New Ticket")');

    // Fill ticket form
    await page.fill('[name="title"]', 'Test Ticket');
    await page.fill('[name="description"]', 'This is a test ticket');
    await page.selectOption('[name="priority"]', 'HIGH');
    await page.click('button:has-text("Create")');

    // Verify ticket appears on board
    await expect(page.locator('text=Test Ticket')).toBeVisible();

    // Wait for assignment (via WebSocket)
    await page.waitForTimeout(2000);

    // Verify ticket has assignee avatar
    const ticket = page.locator('[data-testid="ticket-card"]:has-text("Test Ticket")');
    await expect(ticket.locator('[data-testid="assignee-avatar"]')).toBeVisible();
  });

  test('should move ticket across columns (drag and drop)', async ({ page }) => {
    await page.goto('/projects/test-project/board');

    // Get ticket in OPEN column
    const ticket = page.locator('[data-testid="column-OPEN"] [data-testid="ticket-card"]').first();
    const ticketText = await ticket.textContent();

    // Drag to IN_PROGRESS column
    const targetColumn = page.locator('[data-testid="column-IN_PROGRESS"]');
    await ticket.dragTo(targetColumn);

    // Verify ticket moved
    await expect(page.locator(`[data-testid="column-IN_PROGRESS"]:has-text("${ticketText}")`)).toBeVisible();

    // Verify other users see the change (in a real test, you'd open a second browser context)
  });

  test('should add comment to ticket', async ({ page }) => {
    await page.goto('/projects/test-project/board');

    // Open ticket detail
    await page.click('[data-testid="ticket-card"]').first();

    // Add comment
    await page.fill('[data-testid="comment-input"]', 'This is a test comment');
    await page.click('button:has-text("Post Comment")');

    // Verify comment appears
    await expect(page.locator('text=This is a test comment')).toBeVisible();
  });

  test('should filter tickets by assignee', async ({ page }) => {
    await page.goto('/projects/test-project/board');

    // Open filter
    await page.click('button:has-text("Filters")');

    // Select assignee
    await page.click('[data-testid="filter-assignee"]');
    await page.click('text=John Doe');

    // Verify only John's tickets are visible
    const tickets = page.locator('[data-testid="ticket-card"]');
    await expect(tickets).toHaveCount(await tickets.count());

    // All visible tickets should have John as assignee
    for (const ticket of await tickets.all()) {
      await expect(ticket.locator('text=John Doe')).toBeVisible();
    }
  });
});
```

### 4.3 Visual Regression Testing

```typescript
// apps/web/e2e/visual-regression.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Visual Regression Tests', () => {
  test('board layout', async ({ page }) => {
    await page.goto('/projects/test-project/board');
    await expect(page).toHaveScreenshot('board-layout.png');
  });

  test('ticket detail modal', async ({ page }) => {
    await page.goto('/projects/test-project/board');
    await page.click('[data-testid="ticket-card"]').first();
    await expect(page.locator('[data-testid="ticket-detail-modal"]')).toHaveScreenshot('ticket-detail.png');
  });

  test('responsive mobile view', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/projects/test-project/board');
    await expect(page).toHaveScreenshot('board-mobile.png');
  });
});
```

---

## 5. Load Testing (K6)

### 5.1 K6 Script

```javascript
// tests/load/ticket-creation.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '2m', target: 100 },  // Ramp up to 100 users
    { duration: '5m', target: 100 },  // Stay at 100 users
    { duration: '2m', target: 200 },  // Ramp up to 200 users
    { duration: '5m', target: 200 },  // Stay at 200 users
    { duration: '2m', target: 0 },    // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests should be below 500ms
    http_req_failed: ['rate<0.01'],   // Error rate should be below 1%
    errors: ['rate<0.1'],             // Custom error rate
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export function setup() {
  // Login and get token
  const loginRes = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
    email: 'loadtest@example.com',
    password: 'Password123!',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  return { accessToken: loginRes.json('accessToken') };
}

export default function (data) {
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${data.accessToken}`,
    },
  };

  // Get projects
  let res = http.get(`${BASE_URL}/projects`, params);
  check(res, {
    'get projects status is 200': (r) => r.status === 200,
  }) || errorRate.add(1);

  sleep(1);

  // Get board
  const projectId = res.json('data.0.id');
  res = http.get(`${BASE_URL}/projects/${projectId}/board`, params);
  check(res, {
    'get board status is 200': (r) => r.status === 200,
    'board load time < 500ms': (r) => r.timings.duration < 500,
  }) || errorRate.add(1);

  sleep(2);

  // Create ticket
  const ticket = {
    title: `Load Test Ticket ${Date.now()}`,
    description: 'This is a load test ticket',
    priority: 'MEDIUM',
  };

  res = http.post(`${BASE_URL}/projects/${projectId}/tickets`, JSON.stringify(ticket), params);
  check(res, {
    'create ticket status is 201': (r) => r.status === 201,
    'ticket created successfully': (r) => r.json('id') !== undefined,
  }) || errorRate.add(1);

  sleep(1);

  // Get ticket details
  const ticketId = res.json('id');
  res = http.get(`${BASE_URL}/tickets/${ticketId}`, params);
  check(res, {
    'get ticket status is 200': (r) => r.status === 200,
  }) || errorRate.add(1);

  sleep(2);
}

export function teardown(data) {
  // Cleanup if needed
}
```

### 5.2 Ejecutar Load Tests

```bash
# Run locally
k6 run tests/load/ticket-creation.js

# Run with custom config
k6 run --vus 50 --duration 5m tests/load/ticket-creation.js

# Run and send results to Grafana Cloud
k6 run --out cloud tests/load/ticket-creation.js

# Run in CI/CD
k6 run --quiet --no-color --summary-export=summary.json tests/load/ticket-creation.js
```

---

## 6. Performance Testing (Artillery)

### 6.1 Artillery Configuration

```yaml
# tests/performance/websocket-load.yml

config:
  target: "ws://localhost:3000"
  phases:
    - duration: 60
      arrivalRate: 10  # 10 new connections per second
      name: "Warm up"
    - duration: 120
      arrivalRate: 50  # 50 new connections per second
      name: "Ramp up load"
    - duration: 60
      arrivalRate: 50
      name: "Sustained load"
  processor: "./websocket-processor.js"
  plugins:
    expect: {}

scenarios:
  - name: "WebSocket connection and board updates"
    engine: "ws"
    flow:
      - think: 1
      - emit:
          channel: "joinProject"
          data:
            projectId: "{{ projectId }}"
      - think: 2
      - emit:
          channel: "subscribeToTickets"
          data:
            projectId: "{{ projectId }}"
      - think: 30
      - emit:
          channel: "leaveProject"
          data:
            projectId: "{{ projectId }}"
```

```javascript
// tests/performance/websocket-processor.js

module.exports = {
  setProjectId: function(context, events, done) {
    context.vars.projectId = 'test-project-id';
    return done();
  },

  logMessage: function(message) {
    console.log(`Received: ${JSON.stringify(message)}`);
  }
};
```

### 6.2 Ejecutar Performance Tests

```bash
# Run Artillery test
artillery run tests/performance/websocket-load.yml

# Generate HTML report
artillery run --output report.json tests/performance/websocket-load.yml
artillery report report.json
```

---

## 7. Contract Testing (Pact)

### 7.1 Consumer Contract (Ticket Service)

```typescript
// apps/ticket-service/test/contracts/assignment-service.contract.spec.ts

import { pactWith } from 'jest-pact';
import { like, eachLike } from '@pact-foundation/pact/src/dsl/matchers';
import { TicketService } from '../src/ticket.service';

pactWith({ consumer: 'TicketService', provider: 'AssignmentService' }, (interaction) => {
  let ticketService: TicketService;

  beforeEach(() => {
    // Setup
  });

  describe('when a ticket.assigned event is received', () => {
    beforeEach(() => {
      const event = {
        eventType: 'ticket.assigned',
        payload: {
          ticketId: like('ticket-123'),
          assigneeId: like('user-456'),
          assignedAt: like('2025-12-20T10:00:00Z'),
        },
      };

      return interaction
        .uponReceiving('a ticket.assigned event')
        .withRequest({
          method: 'POST',
          path: '/events/ticket.assigned',
          headers: { 'Content-Type': 'application/json' },
          body: event,
        })
        .willRespondWith({
          status: 200,
        });
    });

    it('updates the ticket assignee', async () => {
      const event = {
        eventType: 'ticket.assigned',
        payload: {
          ticketId: 'ticket-123',
          assigneeId: 'user-456',
          assignedAt: '2025-12-20T10:00:00Z',
        },
      };

      await ticketService.handleTicketAssigned(event);

      // Verify ticket was updated
    });
  });
});
```

---

## 8. Security Testing

### 8.1 OWASP ZAP Automation

```yaml
# tests/security/zap-scan.yml

env:
  contexts:
    - name: "SyncroBoard"
      urls:
        - "http://localhost:3000"
      includePaths:
        - "http://localhost:3000/.*"
      authentication:
        method: "json"
        parameters:
          loginUrl: "http://localhost:3000/auth/login"
          loginRequestData: '{"email":"security@test.com","password":"SecurePass123!"}'
        verification:
          method: "response"
          pollFrequency: 60
          pollUnits: "requests"

jobs:
  - type: spider
    parameters:
      maxDuration: 5
      maxDepth: 5

  - type: passiveScan-wait
    parameters:
      maxDuration: 10

  - type: activeScan
    parameters:
      maxDuration: 10
      policy: "API-Minimal"

  - type: report
    parameters:
      template: "traditional-html"
      reportDir: "reports"
      reportFile: "zap-report.html"
```

### 8.2 Dependency Scanning

```bash
# package.json scripts
{
  "scripts": {
    "security:audit": "npm audit --audit-level=moderate",
    "security:snyk": "snyk test",
    "security:scan": "npm run security:audit && npm run security:snyk"
  }
}
```

---

## 9. Test Data Management

### 9.1 Test Data Factory

```typescript
// libs/common/src/testing/factories/user.factory.ts

import { faker } from '@faker-js/faker';
import { User } from '../entities/user.entity';

export class UserFactory {
  static create(overrides?: Partial<User>): User {
    return {
      id: faker.string.uuid(),
      email: faker.internet.email(),
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      provider: 'LOCAL',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  static createMany(count: number, overrides?: Partial<User>): User[] {
    return Array.from({ length: count }, () => this.create(overrides));
  }
}

// Usage
const testUser = UserFactory.create({ email: 'specific@test.com' });
const testUsers = UserFactory.createMany(10);
```

---

## 10. CI/CD Integration

### 10.1 GitHub Actions Test Workflow

```yaml
# .github/workflows/test.yml

name: Test Suite

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run test:unit -- --coverage
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run test:integration

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: apps/web/playwright-report/

  load-tests:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: grafana/setup-k6-action@v1
      - run: k6 run tests/load/ticket-creation.js
```

---

## 11. Test Metrics & Reporting

### 11.1 Coverage Goals

| Type | Target | Critical |
|------|--------|----------|
| Unit Tests | 80% | 70% |
| Integration Tests | Key endpoints | All CRUD operations |
| E2E Tests | Critical paths | Login, Create Ticket, Move Ticket |
| Load Tests | 1000 req/s | 500 req/s |

### 11.2 Quality Gates

```yaml
# sonar-project.properties

sonar.projectKey=syncroboard
sonar.organization=syncroboard

sonar.sources=src
sonar.tests=test
sonar.test.inclusions=**/*.spec.ts,**/*.test.ts

# Coverage
sonar.javascript.lcov.reportPaths=coverage/lcov.info
sonar.coverage.exclusions=**/*.spec.ts,**/*.test.ts

# Quality Gates
sonar.qualitygate.wait=true
sonar.qualitygate.timeout=300
```

---

**Changelog:**

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0.0 | 2025-12-20 | Especificación inicial |
