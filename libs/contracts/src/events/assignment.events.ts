export interface TicketAssignedEvent {
  eventId: string;
  assignmentId: string;
  ticketId: string;
  userId: string;
  assignedById: string;
  timestamp: Date;
}

export interface TicketUnassignedEvent {
  eventId: string;
  assignmentId: string;
  ticketId: string;
  userId: string;
  unassignedById: string;
  timestamp: Date;
}

export interface AssignmentUpdatedEvent {
  eventId: string;
  assignmentId: string;
  ticketId: string;
  oldUserId: string;
  newUserId: string;
  updatedById: string;
  timestamp: Date;
}
