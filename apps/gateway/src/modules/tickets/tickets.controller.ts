import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { CurrentUser } from '@app/common';
import { JwtAuthGuard } from '@gateway/guards/jwt-auth.guard';
import {
  CreateTicketDto,
  UpdateTicketDto,
  TicketFilterDto,
  CreateCommentDto,
} from '@app/contracts';

@Controller('tickets')
@UseGuards(JwtAuthGuard)
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  async create(
    @Body() createTicketDto: CreateTicketDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.ticketsService.create(createTicketDto, userId);
  }

  @Get()
  async findAll(@Query() filterDto: TicketFilterDto) {
    return this.ticketsService.findAll(filterDto);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.ticketsService.findOne(id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateTicketDto: UpdateTicketDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.ticketsService.update(id, updateTicketDto, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id') id: string) {
    return this.ticketsService.delete(id);
  }
}
