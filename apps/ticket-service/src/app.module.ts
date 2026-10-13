import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { TicketsModule } from '@ticket/modules/tickets/tickets.module';
import { CommentsModule } from '@ticket/modules/comments/comments.module';
import { getDatabaseConfig } from '@ticket/config/database.config';
import { HttpExceptionFilter, LoggingInterceptor, KafkaModule } from '@app/common';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRoot(getDatabaseConfig()),
    ScheduleModule.forRoot(),
    KafkaModule.register({
      clientId: process.env.KAFKA_CLIENT_ID || 'ticket-service',
      groupId: process.env.KAFKA_GROUP_ID || 'ticket-service-group',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    }),
    TicketsModule,
    CommentsModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {}
