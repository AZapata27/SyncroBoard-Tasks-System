import { HttpException, HttpStatus } from '@nestjs/common';
import { AxiosError } from 'axios';

export interface AxiosErrorResponse {
  message?: string;
  statusCode?: number;
  error?: string;
  [key: string]: unknown;
}

export function handleAxiosError(error: unknown, defaultMessage = 'Service unavailable'): never {
  if (error instanceof Error && 'isAxiosError' in error) {
    const axiosError = error as AxiosError<AxiosErrorResponse>;
    throw new HttpException(
      axiosError.response?.data || defaultMessage,
      axiosError.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  if (error instanceof Error) {
    throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
  }

  throw new HttpException(defaultMessage, HttpStatus.INTERNAL_SERVER_ERROR);
}
