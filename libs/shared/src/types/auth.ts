import { UserRole } from './roles';
import { FeatureFlag } from './features';

export interface LoginRequest {
  email: string;
  password: string;
  tenantSlug?: string; // optional for SuperAdmin
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  tenantId: string | null;
  tenantSlug: string | null;
  branchId: string | null;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  features: FeatureFlag[];
}

export interface JwtPayload {
  sub: string;       // user id
  email: string;
  role: UserRole;
  tenantId: string | null;
  branchId: string | null;
  iat?: number;
  exp?: number;
}
