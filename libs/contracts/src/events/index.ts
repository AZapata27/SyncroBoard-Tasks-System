export * from './user.events';
export * from './ticket.events';
export * from './assignment.events';

// Event Topics
export const KAFKA_TOPICS = {
  USER_EVENTS: 'user.events',
  TICKET_EVENTS: 'ticket.events',
  ASSIGNMENT_EVENTS: 'assignment.events',
  NOTIFICATION_EVENTS: 'notification.events',
} as const;

// Event Types
export const EVENT_TYPES = {
  USER_REGISTERED: 'user.registered',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
  USER_ROLE_CHANGED: 'user.role.changed',

  TICKET_CREATED: 'ticket.created',
  TICKET_UPDATED: 'ticket.updated',
  TICKET_STATUS_CHANGED: 'ticket.status.changed',
  TICKET_DELETED: 'ticket.deleted',
  TICKET_COMMENT_ADDED: 'ticket.comment.added',

  TICKET_ASSIGNED: 'ticket.assigned',
  TICKET_UNASSIGNED: 'ticket.unassigned',
  ASSIGNMENT_UPDATED: 'assignment.updated',
} as const;
