import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { KAFKA_TOPICS } from '@app/contracts';

interface KafkaEventMessage {
  eventId: string;
  eventType: string;
  timestamp: Date;
  [key: string]: unknown;
}

interface UserEventMessage extends KafkaEventMessage {
  userId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

interface TicketEventMessage extends KafkaEventMessage {
  ticketId: string;
  projectId?: string;
  reporterId?: string;
  status?: string;
}

interface AssignmentEventMessage extends KafkaEventMessage {
  assignmentId: string;
  ticketId: string;
  userId: string;
  assignedById?: string;
  unassignedById?: string;
}

@Controller()
export class EventsController {
  private readonly logger = new Logger(EventsController.name);

  @EventPattern(KAFKA_TOPICS.USER_EVENTS)
  async handleUserEvents(@Payload() message: UserEventMessage): Promise<void> {
    this.logger.log(`Received user event: ${message.eventType}`);
    this.logger.debug(JSON.stringify(message, null, 2));

    // TODO: Implement notification logic
    // - Send email notifications
    // - Send WebSocket notifications
    // - Send push notifications
    // - Store notifications in database
  }

  @EventPattern(KAFKA_TOPICS.TICKET_EVENTS)
  async handleTicketEvents(@Payload() message: TicketEventMessage): Promise<void> {
    this.logger.log(`Received ticket event: ${message.eventType}`);
    this.logger.debug(JSON.stringify(message, null, 2));

    // TODO: Implement notification logic for ticket events
    // Example: Notify assignees when ticket is created or updated
  }

  @EventPattern(KAFKA_TOPICS.ASSIGNMENT_EVENTS)
  async handleAssignmentEvents(@Payload() message: AssignmentEventMessage): Promise<void> {
    this.logger.log(`Received assignment event: ${message.eventType}`);
    this.logger.debug(JSON.stringify(message, null, 2));

    // TODO: Implement notification logic for assignment events
    // Example: Notify user when assigned to a ticket
  }

  @EventPattern(KAFKA_TOPICS.NOTIFICATION_EVENTS)
  async handleNotificationEvents(@Payload() message: KafkaEventMessage): Promise<void> {
    this.logger.log(`Received notification event: ${message.eventType}`);
    this.logger.debug(JSON.stringify(message, null, 2));

    // TODO: Process notification events
  }
}
