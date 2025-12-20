export declare class RegisterDto {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role?: string;
}
export declare class LoginDto {
    email: string;
    password: string;
}
export declare class AuthResponseDto {
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
export declare class RefreshTokenDto {
    refreshToken: string;
}
export declare class ChangePasswordDto {
    currentPassword: string;
    newPassword: string;
}
export declare class ResetPasswordDto {
    email: string;
}
export declare class ResetPasswordConfirmDto {
    token: string;
    newPassword: string;
}
