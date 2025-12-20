import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersModule } from '@auth/modules/users/users.module';
import { OutboxModule } from '@app/common';
import { getJwtConfig } from '@auth/config/jwt.config';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.register(getJwtConfig()),
    OutboxModule,
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
