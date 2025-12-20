import { Injectable, HttpException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  AssignTicketDto,
  UnassignTicketDto,
  AssignmentResponseDto,
  GetAssignmentsDto,
} from '@app/contracts';

@Injectable()
export class AssignmentsService {
  private readonly assignmentServiceUrl: string;

  constructor(private readonly httpService: HttpService) {
    this.assignmentServiceUrl = process.env.ASSIGNMENT_SERVICE_URL || 'http://localhost:3003';
  }

  async assign(
    assignTicketDto: AssignTicketDto,
    userId: string,
  ): Promise<AssignmentResponseDto> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.assignmentServiceUrl}/api/v1/assignments/assign`,
          assignTicketDto,
          {
            headers: { 'x-user-id': userId },
          },
        ),
      );
      return response.data;
    } catch (error: any) {
      throw new HttpException(
        error.response?.data || 'Assignment service unavailable',
        error.response?.status || 500,
      );
    }
  }

  async unassign(
    unassignTicketDto: UnassignTicketDto,
    userId: string,
  ): Promise<{ message: string }> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.assignmentServiceUrl}/api/v1/assignments/unassign`,
          unassignTicketDto,
          {
            headers: { 'x-user-id': userId },
          },
        ),
      );
      return response.data;
    } catch (error: any) {
      throw new HttpException(
        error.response?.data || 'Assignment service unavailable',
        error.response?.status || 500,
      );
    }
  }

  async findAll(
    getAssignmentsDto: GetAssignmentsDto,
  ): Promise<{ data: AssignmentResponseDto[]; total: number }> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.assignmentServiceUrl}/api/v1/assignments`, {
          params: getAssignmentsDto,
        }),
      );
      return response.data;
    } catch (error: any) {
      throw new HttpException(
        error.response?.data || 'Assignment service unavailable',
        error.response?.status || 500,
      );
    }
  }

  async findByTicket(ticketId: string): Promise<AssignmentResponseDto[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.assignmentServiceUrl}/api/v1/assignments/ticket/${ticketId}`),
      );
      return response.data;
    } catch (error: any) {
      throw new HttpException(
        error.response?.data || 'Assignment service unavailable',
        error.response?.status || 500,
      );
    }
  }

  async findByUser(userId: string): Promise<AssignmentResponseDto[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.assignmentServiceUrl}/api/v1/assignments/user/${userId}`),
      );
      return response.data;
    } catch (error: any) {
      throw new HttpException(
        error.response?.data || 'Assignment service unavailable',
        error.response?.status || 500,
      );
    }
  }
}
