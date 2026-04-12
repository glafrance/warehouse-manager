export type Role = 'ADMIN' | 'USER' | string;

export interface AuthUser {
  id: number | string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  roles: Role[];
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  password: string;
  confirmPassword?: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType?: string;
  expiresIn?: number;
  user: AuthUser;
}
