import { TicketType, TicketPriority, TicketStatus } from '../enums';
export declare class CreateTicketDto {
    projectId: string;
    title: string;
    description: string;
    type: TicketType;
    priority: TicketPriority;
    estimatedHours?: number;
    sprintId?: string;
    parentTicketId?: string;
}
export declare class UpdateTicketDto {
    title?: string;
    description?: string;
    type?: TicketType;
    priority?: TicketPriority;
    status?: TicketStatus;
    estimatedHours?: number;
    sprintId?: string;
}
export declare class TicketResponseDto {
    id: string;
    projectId: string;
    title: string;
    description: string;
    type: TicketType;
    priority: TicketPriority;
    status: TicketStatus;
    reporterId: string;
    estimatedHours?: number;
    sprintId?: string;
    parentTicketId?: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare class CreateCommentDto {
    ticketId: string;
    content: string;
}
export declare class CommentResponseDto {
    id: string;
    ticketId: string;
    authorId: string;
    content: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare class TicketFilterDto {
    projectId?: string;
    type?: TicketType;
    priority?: TicketPriority;
    status?: TicketStatus;
    reporterId?: string;
    assigneeId?: string;
    sprintId?: string;
    search?: string;
    page?: number;
    limit?: number;
}
