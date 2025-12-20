export interface UserRegisteredEvent {
  eventId: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  timestamp: Date;
}

export interface UserUpdatedEvent {
  eventId: string;
  userId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  timestamp: Date;
}

export interface UserDeletedEvent {
  eventId: string;
  userId: string;
  timestamp: Date;
}

export interface UserRoleChangedEvent {
  eventId: string;
  userId: string;
  oldRole: string;
  newRole: string;
  timestamp: Date;
}
