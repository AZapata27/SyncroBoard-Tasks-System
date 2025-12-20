import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '@app/common';
import {
  CreateTicketDto,
  UpdateTicketDto,
  TicketFilterDto,
  TicketResponseDto,
  UserRole,
} from '@app/contracts';

@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  async create(
    @Body() createTicketDto: CreateTicketDto,
    @CurrentUser('userId') userId: string,
  ): Promise<TicketResponseDto> {
    return this.ticketsService.create(createTicketDto, userId);
  }

  @Get()
  async findAll(@Query() filterDto: TicketFilterDto) {
    return this.ticketsService.findAll(filterDto);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<TicketResponseDto> {
    return this.ticketsService.findOne(id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateTicketDto: UpdateTicketDto,
    @CurrentUser('userId') userId: string,
  ): Promise<TicketResponseDto> {
    return this.ticketsService.update(id, updateTicketDto, userId);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  async delete(@Param('id') id: string): Promise<{ message: string }> {
    await this.ticketsService.delete(id);
    return { message: 'Ticket deleted successfully' };
  }
}
