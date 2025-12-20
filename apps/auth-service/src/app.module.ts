import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from '@auth/modules/auth/auth.module';
import { UsersModule } from '@auth/modules/users/users.module';
import { getDatabaseConfig } from '@auth/config/database.config';
import {
  HttpExceptionFilter,
  LoggingInterceptor,
  JwtAuthGuard,
  KafkaModule,
  RedisModule,
} from '@app/common';
import { Reflector } from '@nestjs/core';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRoot(getDatabaseConfig()),
    ScheduleModule.forRoot(),
    KafkaModule.register({
      clientId: process.env.KAFKA_CLIENT_ID || 'auth-service',
      groupId: process.env.KAFKA_GROUP_ID || 'auth-service-group',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    }),
    RedisModule.register({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      keyPrefix: 'auth:',
    }),
    AuthModule,
    UsersModule,
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
    {
      provide: APP_GUARD,
      useFactory: (reflector: Reflector) => new JwtAuthGuard(reflector),
      inject: [Reflector],
    },
  ],
})
export class AppModule {}
