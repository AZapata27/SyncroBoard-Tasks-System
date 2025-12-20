import { Controller, Get, Post, Delete, Body, Query, UseGuards, Param } from '@nestjs/common';
import { AssignmentsService } from './assignments.service';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '@app/common';
import {
  AssignTicketDto,
  UnassignTicketDto,
  AssignmentResponseDto,
  GetAssignmentsDto,
  UserRole,
} from '@app/contracts';

@Controller('assignments')
@UseGuards(JwtAuthGuard)
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @Post('assign')
  async assign(
    @Body() assignTicketDto: AssignTicketDto,
    @CurrentUser('userId') userId: string,
  ): Promise<AssignmentResponseDto> {
    return this.assignmentsService.assign(assignTicketDto, userId);
  }

  @Post('unassign')
  async unassign(
    @Body() unassignTicketDto: UnassignTicketDto,
    @CurrentUser('userId') userId: string,
  ): Promise<{ message: string }> {
    await this.assignmentsService.unassign(unassignTicketDto, userId);
    return { message: 'User unassigned successfully' };
  }

  @Get()
  async findAll(@Query() getAssignmentsDto: GetAssignmentsDto) {
    return this.assignmentsService.findAll(getAssignmentsDto);
  }

  @Get('ticket/:ticketId')
  async findByTicket(@Param('ticketId') ticketId: string): Promise<AssignmentResponseDto[]> {
    return this.assignmentsService.findByTicket(ticketId);
  }

  @Get('user/:userId')
  async findByUser(@Param('userId') userId: string): Promise<AssignmentResponseDto[]> {
    return this.assignmentsService.findByUser(userId);
  }
}
