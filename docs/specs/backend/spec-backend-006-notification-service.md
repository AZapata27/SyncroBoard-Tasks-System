# 📧 SPEC-BACKEND-006: Notification Service
## Event-Driven Notification System

**Versión:** 1.0.0
**Última Actualización:** 2025-12-20
**Estado:** Draft
**Dependencias:** `libs/common`, `libs/contracts`, Kafka, SMTP/SendGrid
**Puerto:** 3004
**Base de Datos:** N/A (Stateless)

---

## 1. Responsabilidades

1. **Consumidor de Eventos:** Escuchar eventos de Kafka de todos los servicios
2. **Email Notifications:** Enviar emails transaccionales
3. **In-App Notifications:** (Fase 2) Notificaciones push
4. **Template Engine:** Renderizar emails con plantillas HTML
5. **Preferencias:** Respetar configuración de notificaciones por usuario

---

## 2. Arquitectura

### 2.1 Event-Driven Pattern

```
┌──────────────┐
│ Auth Service │──┐
└──────────────┘  │
                  │
┌──────────────┐  │  ┌───────┐
│Ticket Service│──┼─→│ Kafka │
└──────────────┘  │  └───┬───┘
                  │      │
┌──────────────┐  │      │
│Assignment Svc│──┘      │
└──────────────┘         │
                         ↓
                ┌─────────────────────┐
                │ Notification Service│
                └──────────┬──────────┘
                           │
                ┌──────────┼──────────┐
                │          │          │
                ↓          ↓          ↓
            ┌──────┐  ┌──────┐  ┌──────┐
            │Email │  │ Push │  │ SMS  │
            │(SMTP)│  │(FCM) │  │(Twi) │
            └──────┘  └──────┘  └──────┘
```

---

## 3. Eventos Consumidos

### 3.1 Auth Events

```typescript
// user.created
@EventPattern('user.created')
async handleUserCreated(@Payload() event: UserCreatedEvent) {
  await this.sendEmail({
    to: event.payload.email,
    subject: 'Welcome to SyncroBoard! 🎉',
    template: 'welcome',
    data: {
      firstName: event.payload.firstName,
      email: event.payload.email,
    },
  });
}
```

### 3.2 Ticket Events

```typescript
// ticket.created
@EventPattern('ticket.created')
async handleTicketCreated(@Payload() event: TicketCreatedEvent) {
  // No enviar notificación al creador
  // Esperar a que se asigne
}

// ticket.assigned
@EventPattern('ticket.assigned')
async handleTicketAssigned(@Payload() event: TicketAssignedEvent) {
  const assignee = await this.getUserDetails(event.payload.assigneeId);

  await this.sendEmail({
    to: assignee.email,
    subject: 'You have been assigned a new ticket',
    template: 'ticket-assigned',
    data: {
      firstName: assignee.firstName,
      ticketId: event.payload.ticketId,
      ticketUrl: `${process.env.FRONTEND_URL}/tickets/${event.payload.ticketId}`,
    },
  });
}

// ticket.status.updated
@EventPattern('ticket.status.updated')
async handleTicketStatusUpdated(@Payload() event: TicketStatusUpdatedEvent) {
  // Si el ticket pasa a DONE, notificar al reporter
  if (event.payload.newStatus === 'DONE') {
    const ticket = await this.getTicketDetails(event.payload.ticketId);

    await this.sendEmail({
      to: ticket.reporterEmail,
      subject: `Ticket ${ticket.code} has been completed`,
      template: 'ticket-completed',
      data: {
        ticketCode: ticket.code,
        ticketTitle: ticket.title,
        ticketUrl: `${process.env.FRONTEND_URL}/tickets/${ticket.id}`,
      },
    });
  }
}

// ticket.commented
@EventPattern('ticket.commented')
async handleTicketCommented(@Payload() event: TicketCommentedEvent) {
  const ticket = await this.getTicketDetails(event.payload.ticketId);
  const author = await this.getUserDetails(event.payload.authorId);

  // Notificar a reportero y asignado (excepto el autor del comentario)
  const recipients = [ticket.reporterId, ticket.assigneeId]
    .filter((id) => id && id !== event.payload.authorId);

  for (const userId of recipients) {
    const user = await this.getUserDetails(userId);

    await this.sendEmail({
      to: user.email,
      subject: `New comment on ${ticket.code}`,
      template: 'ticket-commented',
      data: {
        firstName: user.firstName,
        ticketCode: ticket.code,
        authorName: `${author.firstName} ${author.lastName}`,
        comment: event.payload.content.substring(0, 200), // Preview
        ticketUrl: `${process.env.FRONTEND_URL}/tickets/${ticket.id}`,
      },
    });
  }
}
```

---

## 4. Email Service

### 4.1 SMTP Configuration

```typescript
// notification-service/src/email/email.service.ts

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private templates: Map<string, HandlebarsTemplateDelegate> = new Map();

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get('SMTP_HOST'),
      port: this.configService.get('SMTP_PORT'),
      secure: this.configService.get('SMTP_SECURE') === 'true',
      auth: {
        user: this.configService.get('SMTP_USER'),
        pass: this.configService.get('SMTP_PASS'),
      },
    });

    this.loadTemplates();
  }

  private loadTemplates() {
    const templatesDir = path.join(__dirname, '..', 'templates');
    const templates = ['welcome', 'ticket-assigned', 'ticket-completed', 'ticket-commented'];

    for (const template of templates) {
      const filePath = path.join(templatesDir, `${template}.hbs`);
      const source = fs.readFileSync(filePath, 'utf-8');
      this.templates.set(template, handlebars.compile(source));
    }
  }

  async sendEmail(options: {
    to: string;
    subject: string;
    template: string;
    data: Record<string, any>;
  }) {
    const template = this.templates.get(options.template);
    if (!template) {
      throw new Error(`Template ${options.template} not found`);
    }

    const html = template(options.data);

    await this.transporter.sendMail({
      from: this.configService.get('SMTP_FROM'),
      to: options.to,
      subject: options.subject,
      html,
    });

    console.log(`📧 Email sent to ${options.to}: ${options.subject}`);
  }

  async sendBulkEmail(recipients: Array<{
    to: string;
    subject: string;
    template: string;
    data: Record<string, any>;
  }>) {
    await Promise.all(recipients.map((r) => this.sendEmail(r)));
  }
}
```

### 4.2 SendGrid Alternative (Production)

```typescript
// notification-service/src/email/sendgrid.service.ts

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sgMail from '@sendgrid/mail';

@Injectable()
export class SendGridService {
  constructor(private configService: ConfigService) {
    sgMail.setApiKey(this.configService.get('SENDGRID_API_KEY')!);
  }

  async sendEmail(options: {
    to: string;
    subject: string;
    template: string;
    data: Record<string, any>;
  }) {
    await sgMail.send({
      to: options.to,
      from: this.configService.get('SENDGRID_FROM_EMAIL')!,
      subject: options.subject,
      templateId: this.getTemplateId(options.template),
      dynamicTemplateData: options.data,
    });
  }

  private getTemplateId(template: string): string {
    const templates = {
      welcome: process.env.SENDGRID_TEMPLATE_WELCOME,
      'ticket-assigned': process.env.SENDGRID_TEMPLATE_TICKET_ASSIGNED,
      'ticket-completed': process.env.SENDGRID_TEMPLATE_TICKET_COMPLETED,
      'ticket-commented': process.env.SENDGRID_TEMPLATE_TICKET_COMMENTED,
    };

    return templates[template] || '';
  }
}
```

---

## 5. Email Templates

### 5.1 Welcome Email

```handlebars
<!-- notification-service/templates/welcome.hbs -->
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
    .content { padding: 30px 20px; background: #f9f9f9; }
    .button { display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 5px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to SyncroBoard! 🎉</h1>
    </div>
    <div class="content">
      <p>Hi {{firstName}},</p>
      <p>Welcome to <strong>SyncroBoard</strong> - your new workspace for managing projects and tasks efficiently.</p>
      <p>Your account has been successfully created with email: <strong>{{email}}</strong></p>
      <p>Get started by creating your first project:</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="{{frontendUrl}}/projects" class="button">Create Project</a>
      </p>
      <p>If you have any questions, feel free to reach out to our support team.</p>
      <p>Best regards,<br>The SyncroBoard Team</p>
    </div>
  </div>
</body>
</html>
```

### 5.2 Ticket Assigned Email

```handlebars
<!-- notification-service/templates/ticket-assigned.hbs -->
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #10B981; color: white; padding: 20px; }
    .content { padding: 30px 20px; background: #f9f9f9; }
    .ticket-info { background: white; padding: 15px; border-left: 4px solid #10B981; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>📋 New Ticket Assigned</h2>
    </div>
    <div class="content">
      <p>Hi {{firstName}},</p>
      <p>You have been assigned a new ticket:</p>
      <div class="ticket-info">
        <p><strong>Ticket:</strong> {{ticketCode}}</p>
        <p><strong>Title:</strong> {{ticketTitle}}</p>
        <p><strong>Priority:</strong> {{ticketPriority}}</p>
      </div>
      <p style="text-align: center;">
        <a href="{{ticketUrl}}" class="button">View Ticket</a>
      </p>
    </div>
  </div>
</body>
</html>
```

---

## 6. User Preferences (Fase 2)

### 6.1 Notification Preferences Model

```typescript
// Future: Almacenar preferencias en Redis o DB

interface NotificationPreferences {
  userId: string;
  emailEnabled: boolean;
  notifyOnAssignment: boolean;
  notifyOnComment: boolean;
  notifyOnStatusChange: boolean;
  notifyOnMention: boolean;
  quietHours: {
    enabled: boolean;
    start: string; // "22:00"
    end: string;   // "08:00"
  };
}

// Verificar preferencias antes de enviar
async shouldSendNotification(
  userId: string,
  eventType: string
): Promise<boolean> {
  const prefs = await this.getPreferences(userId);

  if (!prefs.emailEnabled) return false;

  const eventMap = {
    'ticket.assigned': prefs.notifyOnAssignment,
    'ticket.commented': prefs.notifyOnComment,
    'ticket.status.updated': prefs.notifyOnStatusChange,
  };

  return eventMap[eventType] ?? true;
}
```

---

## 7. Retry & Error Handling

### 7.1 Retry Logic

```typescript
import { retry } from 'rxjs/operators';
import { of } from 'rxjs';

async sendEmailWithRetry(options: EmailOptions) {
  const maxRetries = 3;
  const retryDelay = 1000; // 1 second

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await this.emailService.sendEmail(options);
      return;
    } catch (error) {
      console.error(`Email send failed (attempt ${attempt}/${maxRetries}):`, error);

      if (attempt === maxRetries) {
        // Log to dead letter queue or monitoring system
        await this.logFailedEmail(options, error);
        throw error;
      }

      await this.delay(retryDelay * attempt);
    }
  }
}

private delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

private async logFailedEmail(options: EmailOptions, error: any) {
  console.error('Email permanently failed:', {
    to: options.to,
    subject: options.subject,
    error: error.message,
  });

  // TODO: Store in monitoring system or retry queue
}
```

---

## 8. Rate Limiting

### 8.1 Email Rate Limiter

```typescript
import { Injectable } from '@nestjs/common';
import { RedisService } from '@app/common/redis/redis.service';

@Injectable()
export class EmailRateLimiter {
  constructor(private redisService: RedisService) {}

  async canSendEmail(email: string): Promise<boolean> {
    const key = `email_rate_limit:${email}`;
    const limit = 10; // 10 emails per hour
    const ttl = 3600; // 1 hour

    const current = await this.redisService.incr(key);

    if (current === 1) {
      await this.redisService.expire(key, ttl);
    }

    return current <= limit;
  }
}

// Uso
@EventPattern('ticket.assigned')
async handleTicketAssigned(@Payload() event: TicketAssignedEvent) {
  const assignee = await this.getUserDetails(event.payload.assigneeId);

  if (!(await this.rateLimiter.canSendEmail(assignee.email))) {
    console.warn(`Rate limit exceeded for ${assignee.email}`);
    return;
  }

  await this.sendEmail({ ... });
}
```

---

## 9. Testing

```typescript
describe('NotificationService', () => {
  let service: NotificationService;
  let emailService: jest.Mocked<EmailService>;

  beforeEach(() => {
    emailService = {
      sendEmail: jest.fn().mockResolvedValue(undefined),
    } as any;

    service = new NotificationService(emailService);
  });

  it('should send welcome email on user.created', async () => {
    const event: UserCreatedEvent = {
      eventType: 'user.created',
      payload: {
        userId: 'user-123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      },
    };

    await service.handleUserCreated(event);

    expect(emailService.sendEmail).toHaveBeenCalledWith({
      to: 'test@example.com',
      subject: expect.stringContaining('Welcome'),
      template: 'welcome',
      data: expect.objectContaining({
        firstName: 'John',
      }),
    });
  });
});
```

---

## 10. Variables de Entorno

```env
# SMTP (Development)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="SyncroBoard <noreply@syncroboard.com>"

# SendGrid (Production)
SENDGRID_API_KEY=<your-api-key>
SENDGRID_FROM_EMAIL=noreply@syncroboard.com
SENDGRID_TEMPLATE_WELCOME=d-xxx
SENDGRID_TEMPLATE_TICKET_ASSIGNED=d-yyy

# Kafka
KAFKA_BROKERS=kafka:9092
KAFKA_GROUP_ID=notification-service-group

# App
PORT=3004
FRONTEND_URL=https://syncroboard.com
```

---

## 11. Next Steps

### Phase 1 (MVP)
- [x] Email notifications
- [x] Event consumers
- [x] Template engine

### Phase 2
- [ ] User preferences
- [ ] Push notifications (FCM)
- [ ] In-app notifications
- [ ] Notification center UI

### Phase 3
- [ ] SMS notifications (Twilio)
- [ ] Slack integration
- [ ] Digest emails (daily summary)

---

**Referencias:**
- [Nodemailer Docs](https://nodemailer.com/)
- [SendGrid Node.js](https://github.com/sendgrid/sendgrid-nodejs)
- [Handlebars Templates](https://handlebarsjs.com/)

---

**Changelog:**

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0.0 | 2025-12-20 | Especificación inicial |
