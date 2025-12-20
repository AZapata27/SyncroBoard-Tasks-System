import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CurrentUser, JwtAuthGuard } from '@app/common';
import { CreateCommentDto, CommentResponseDto } from '@app/contracts';

@Controller('comments')
@UseGuards(JwtAuthGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  async create(
    @Body() createCommentDto: CreateCommentDto,
    @CurrentUser('userId') userId: string,
  ): Promise<CommentResponseDto> {
    return this.commentsService.create(createCommentDto, userId);
  }

  @Get('ticket/:ticketId')
  async findByTicket(@Param('ticketId') ticketId: string): Promise<CommentResponseDto[]> {
    return this.commentsService.findByTicket(ticketId);
  }

  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
  ): Promise<{ message: string }> {
    await this.commentsService.delete(id, userId);
    return { message: 'Comment deleted successfully' };
  }
}
