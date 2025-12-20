# 🔒 SPEC-SECURITY-001: Security & Compliance
## OWASP Top 10, GDPR, Security Best Practices

**Versión:** 1.0.0
**Última Actualización:** 2025-12-20
**Estado:** Draft

---

## 1. OWASP Top 10 Mitigation

### 1.1 A01:2021 – Broken Access Control

**Mitigaciones:**
- ✅ Guards de NestJS en todos los endpoints
- ✅ RBAC implementation
- ✅ Validación de ownership en recursos
- ✅ Rate limiting por usuario

```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.PROJECT_MANAGER)
@Get('sensitive-endpoint')
async sensitiveOperation() {
  // Implementation
}
```

### 1.2 A02:2021 – Cryptographic Failures

**Mitigaciones:**
- ✅ Argon2 para passwords
- ✅ TLS 1.3 en todas las comunicaciones
- ✅ Secrets en AWS Secrets Manager
- ✅ Encryption at rest (RDS, S3)

### 1.3 A03:2021 – Injection

**Mitigaciones:**
- ✅ TypeORM con prepared statements
- ✅ class-validator para input validation
- ✅ DTOs tipados en TypeScript

```typescript
export class CreateTicketDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(TicketPriority)
  priority: TicketPriority;
}
```

---

## 2. GDPR Compliance

### 2.1 Data Subject Rights

| Derecho | Implementación |
|---------|----------------|
| Right to Access | GET /users/:id/data-export |
| Right to Rectification | PATCH /users/:id |
| Right to Erasure | DELETE /users/:id (soft delete) |
| Right to Data Portability | JSON/CSV export |
| Right to Object | Opt-out de notificaciones |

### 2.2 Data Retention Policy

```typescript
// Automatic data retention
@Cron('0 0 * * *') // Daily at midnight
async cleanupOldData() {
  // Delete soft-deleted users after 30 days
  await this.userRepository
    .createQueryBuilder()
    .delete()
    .where('deleted_at < :date', { date: subDays(new Date(), 30) })
    .execute();

  // Delete old logs after 90 days
  await this.logRepository
    .createQueryBuilder()
    .delete()
    .where('created_at < :date', { date: subDays(new Date(), 90) })
    .execute();
}
```

---

## 3. Security Headers (Helmet.js)

```typescript
// apps/gateway/src/main.ts

import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'wss:', 'https:'],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
}));
```

---

## 4. Penetration Testing Checklist

### 4.1 Automated Scans
- [ ] OWASP ZAP full scan
- [ ] Burp Suite automated scan
- [ ] Nmap port scanning
- [ ] Nikto web server scan

### 4.2 Manual Testing
- [ ] SQL injection attempts
- [ ] XSS payload testing
- [ ] CSRF token bypass attempts
- [ ] Authentication bypass
- [ ] Authorization escalation
- [ ] Session fixation

---

## 5. Incident Response Plan

### 5.1 Security Incident Classification

| Level | Description | Response Time |
|-------|-------------|---------------|
| Critical | Data breach, system compromise | < 1 hour |
| High | Vulnerability exploit, DoS | < 4 hours |
| Medium | Suspicious activity | < 24 hours |
| Low | Minor vulnerability | < 1 week |

### 5.2 Incident Response Steps

1. **Detection:** Monitoring alerts trigger
2. **Containment:** Isolate affected systems
3. **Eradication:** Remove threat
4. **Recovery:** Restore services
5. **Post-Incident:** Document and improve

---

**Changelog:**

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0.0 | 2025-12-20 | Especificación inicial |
