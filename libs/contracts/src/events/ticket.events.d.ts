export interface TicketCreatedEvent {
    eventId: string;
    ticketId: string;
    projectId: string;
    title: string;
    description: string;
    type: string;
    priority: string;
    status: string;
    reporterId: string;
    timestamp: Date;
}
export interface TicketUpdatedEvent {
    eventId: string;
    ticketId: string;
    projectId: string;
    title?: string;
    description?: string;
    type?: string;
    priority?: string;
    status?: string;
    timestamp: Date;
}
export interface TicketStatusChangedEvent {
    eventId: string;
    ticketId: string;
    oldStatus: string;
    newStatus: string;
    changedById: string;
    timestamp: Date;
}
export interface TicketDeletedEvent {
    eventId: string;
    ticketId: string;
    projectId: string;
    timestamp: Date;
}
export interface TicketCommentAddedEvent {
    eventId: string;
    ticketId: string;
    commentId: string;
    authorId: string;
    content: string;
    timestamp: Date;
}
