import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PassportModule } from '@nestjs/passport';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: parseInt(process.env.TICKET_SERVICE_TIMEOUT || '5000', 10),
      maxRedirects: 5,
    }),
    PassportModule,
  ],
  controllers: [TicketsController, CommentsController],
  providers: [TicketsService, CommentsService],
})
export class TicketsModule {}
