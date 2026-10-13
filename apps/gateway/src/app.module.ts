import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { Reflector } from '@nestjs/core';
import { AuthModule } from '@gateway/modules/auth/auth.module';
import { TicketsModule } from '@gateway/modules/tickets/tickets.module';
import { AssignmentsModule } from '@gateway/modules/assignments/assignments.module';
import { NotificationsModule } from '@gateway/modules/notifications/notifications.module';
import { JwtAuthGuard } from '@gateway/guards/jwt-auth.guard';
import { HttpExceptionFilter, LoggingInterceptor } from '@app/common';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    AuthModule,
    TicketsModule,
    AssignmentsModule,
    NotificationsModule,
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
