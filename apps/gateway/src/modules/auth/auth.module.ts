import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from '@gateway/guards/jwt.strategy';

@Module({
  imports: [
    HttpModule.register({
      timeout: parseInt(process.env.AUTH_SERVICE_TIMEOUT || '5000', 10),
      maxRedirects: 5,
    }),
    PassportModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
