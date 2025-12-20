export class AssignTicketDto {
  ticketId: string;
  userId: string;
}

export class UnassignTicketDto {
  ticketId: string;
  userId: string;
}

export class AssignmentResponseDto {
  id: string;
  ticketId: string;
  userId: string;
  assignedById: string;
  assignedAt: Date;
}

export class GetAssignmentsDto {
  ticketId?: string;
  userId?: string;
  projectId?: string;
  page?: number;
  limit?: number;
}
