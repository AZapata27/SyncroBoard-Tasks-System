export class RegisterDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: string;
}

export class LoginDto {
  email: string;
  password: string;
}

export class AuthResponseDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  };
}

export class RefreshTokenDto {
  refreshToken: string;
}

export class ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

export class ResetPasswordDto {
  email: string;
}

export class ResetPasswordConfirmDto {
  token: string;
  newPassword: string;
}
