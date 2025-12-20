import { Injectable, HttpException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { CreateCommentDto, CommentResponseDto } from '@app/contracts';

@Injectable()
export class CommentsService {
  private readonly ticketServiceUrl: string;

  constructor(private readonly httpService: HttpService) {
    this.ticketServiceUrl = process.env.TICKET_SERVICE_URL || 'http://localhost:3002';
  }

  async create(createCommentDto: CreateCommentDto, userId: string): Promise<CommentResponseDto> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.ticketServiceUrl}/api/v1/comments`, createCommentDto, {
          headers: { 'x-user-id': userId },
        }),
      );
      return response.data;
    } catch (error: any) {
      throw new HttpException(
        error.response?.data || 'Ticket service unavailable',
        error.response?.status || 500,
      );
    }
  }

  async findByTicket(ticketId: string): Promise<CommentResponseDto[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.ticketServiceUrl}/api/v1/comments/ticket/${ticketId}`),
      );
      return response.data;
    } catch (error: any) {
      throw new HttpException(
        error.response?.data || 'Ticket service unavailable',
        error.response?.status || 500,
      );
    }
  }

  async delete(id: string, userId: string): Promise<{ message: string }> {
    try {
      const response = await firstValueFrom(
        this.httpService.delete(`${this.ticketServiceUrl}/api/v1/comments/${id}`, {
          headers: { 'x-user-id': userId },
        }),
      );
      return response.data;
    } catch (error: any) {
      throw new HttpException(
        error.response?.data || 'Ticket service unavailable',
        error.response?.status || 500,
      );
    }
  }
}
