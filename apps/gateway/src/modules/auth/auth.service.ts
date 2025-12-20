import { Injectable, HttpException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  AuthResponseDto,
} from '@app/contracts';

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
    } catch (error: any) {
      throw new HttpException(
        error.response?.data || 'Auth service unavailable',
        error.response?.status || 500,
      );
    }
  }

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.authServiceUrl}/api/v1/auth/login`, loginDto),
      );
      return response.data;
    } catch (error: any) {
      throw new HttpException(
        error.response?.data || 'Auth service unavailable',
        error.response?.status || 500,
      );
    }
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto): Promise<AuthResponseDto> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.authServiceUrl}/api/v1/auth/refresh`, refreshTokenDto),
      );
      return response.data;
    } catch (error: any) {
      throw new HttpException(
        error.response?.data || 'Auth service unavailable',
        error.response?.status || 500,
      );
    }
  }

  async logout(userId: string): Promise<{ message: string }> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.authServiceUrl}/api/v1/auth/logout`, { userId }),
      );
      return response.data;
    } catch (error: any) {
      throw new HttpException(
        error.response?.data || 'Auth service unavailable',
        error.response?.status || 500,
      );
    }
  }

  async getProfile(userId: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.authServiceUrl}/api/v1/auth/me`, {
          params: { userId },
        }),
      );
      return response.data;
    } catch (error: any) {
      throw new HttpException(
        error.response?.data || 'Auth service unavailable',
        error.response?.status || 500,
      );
    }
  }
}
