import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PassportModule } from '@nestjs/passport';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: parseInt(process.env.ASSIGNMENT_SERVICE_TIMEOUT || '5000', 10),
      maxRedirects: 5,
    }),
    PassportModule,
  ],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
})
export class AssignmentsModule {}
