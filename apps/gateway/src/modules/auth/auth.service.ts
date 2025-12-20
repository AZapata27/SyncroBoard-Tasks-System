import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  AuthResponseDto,
  UserResponseDto,
} from '@app/contracts';
import { handleAxiosError } from '../../utils/axios-error.handler';

@Injectable()
export class AuthService {
  private readonly authServiceUrl: string;

  constructor(private readonly httpService: HttpService) {
    this.authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
  }

  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.authServiceUrl}/api/v1/auth/register`, registerDto),
      );
      return response.data;
    } catch (error) {
      handleAxiosError(error, 'Auth service unavailable');
    }
  }

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.authServiceUrl}/api/v1/auth/login`, loginDto),
      );
      return response.data;
    } catch (error) {
      handleAxiosError(error, 'Auth service unavailable');
    }
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto): Promise<AuthResponseDto> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.authServiceUrl}/api/v1/auth/refresh`, refreshTokenDto),
      );
      return response.data;
    } catch (error) {
      handleAxiosError(error, 'Auth service unavailable');
    }
  }

  async logout(userId: string): Promise<{ message: string }> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.authServiceUrl}/api/v1/auth/logout`, { userId }),
      );
      return response.data;
    } catch (error) {
      handleAxiosError(error, 'Auth service unavailable');
    }
  }

  async getProfile(userId: string): Promise<UserResponseDto> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.authServiceUrl}/api/v1/auth/me`, {
          params: { userId },
        }),
      );
      return response.data;
    } catch (error) {
      handleAxiosError(error, 'Auth service unavailable');
    }
  }
}
