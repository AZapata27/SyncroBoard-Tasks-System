import { JwtModuleOptions } from '@nestjs/jwt';

export const getJwtConfig = (): JwtModuleOptions => ({
  secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
  signOptions: {
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  },
});

export const getRefreshJwtConfig = (): JwtModuleOptions => ({
  secret: process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key',
  signOptions: {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
});
