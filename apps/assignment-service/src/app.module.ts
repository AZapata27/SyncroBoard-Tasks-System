import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AssignmentsModule } from '@assignment/modules/assignments/assignments.module';
import { getDatabaseConfig } from '@assignment/config/database.config';
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
      clientId: process.env.KAFKA_CLIENT_ID || 'assignment-service',
      groupId: process.env.KAFKA_GROUP_ID || 'assignment-service-group',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    }),
    AssignmentsModule,
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
