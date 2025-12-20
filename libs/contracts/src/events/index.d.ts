export * from './user.events';
export * from './ticket.events';
export * from './assignment.events';
export declare const KAFKA_TOPICS: {
    readonly USER_EVENTS: "user.events";
    readonly TICKET_EVENTS: "ticket.events";
    readonly ASSIGNMENT_EVENTS: "assignment.events";
    readonly NOTIFICATION_EVENTS: "notification.events";
};
export declare const EVENT_TYPES: {
    readonly USER_REGISTERED: "user.registered";
    readonly USER_UPDATED: "user.updated";
    readonly USER_DELETED: "user.deleted";
    readonly USER_ROLE_CHANGED: "user.role.changed";
    readonly TICKET_CREATED: "ticket.created";
    readonly TICKET_UPDATED: "ticket.updated";
    readonly TICKET_STATUS_CHANGED: "ticket.status.changed";
    readonly TICKET_DELETED: "ticket.deleted";
    readonly TICKET_COMMENT_ADDED: "ticket.comment.added";
    readonly TICKET_ASSIGNED: "ticket.assigned";
    readonly TICKET_UNASSIGNED: "ticket.unassigned";
    readonly ASSIGNMENT_UPDATED: "assignment.updated";
};
