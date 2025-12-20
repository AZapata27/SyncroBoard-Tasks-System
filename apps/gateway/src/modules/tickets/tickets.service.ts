import { Injectable, HttpException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  CreateTicketDto,
  UpdateTicketDto,
  TicketFilterDto,
  TicketResponseDto,
} from '@app/contracts';

@Injectable()
export class TicketsService {
  private readonly ticketServiceUrl: string;

  constructor(private readonly httpService: HttpService) {
    this.ticketServiceUrl = process.env.TICKET_SERVICE_URL || 'http://localhost:3002';
  }

  async create(createTicketDto: CreateTicketDto, userId: string): Promise<TicketResponseDto> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.ticketServiceUrl}/api/v1/tickets`, createTicketDto, {
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

  async findAll(filterDto: TicketFilterDto): Promise<{ data: TicketResponseDto[]; total: number }> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.ticketServiceUrl}/api/v1/tickets`, {
          params: filterDto,
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

  async findOne(id: string): Promise<TicketResponseDto> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.ticketServiceUrl}/api/v1/tickets/${id}`),
      );
      return response.data;
    } catch (error: any) {
      throw new HttpException(
        error.response?.data || 'Ticket service unavailable',
        error.response?.status || 500,
      );
    }
  }

  async update(
    id: string,
    updateTicketDto: UpdateTicketDto,
    userId: string,
  ): Promise<TicketResponseDto> {
    try {
      const response = await firstValueFrom(
        this.httpService.put(`${this.ticketServiceUrl}/api/v1/tickets/${id}`, updateTicketDto, {
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

  async delete(id: string): Promise<{ message: string }> {
    try {
      const response = await firstValueFrom(
        this.httpService.delete(`${this.ticketServiceUrl}/api/v1/tickets/${id}`),
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
