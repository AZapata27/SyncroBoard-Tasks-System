export declare class AssignTicketDto {
    ticketId: string;
    userId: string;
}
export declare class UnassignTicketDto {
    ticketId: string;
    userId: string;
}
export declare class AssignmentResponseDto {
    id: string;
    ticketId: string;
    userId: string;
    assignedById: string;
    assignedAt: Date;
}
export declare class GetAssignmentsDto {
    ticketId?: string;
    userId?: string;
    projectId?: string;
    page?: number;
    limit?: number;
}
