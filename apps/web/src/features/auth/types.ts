export type UserRole = "OWNER" | "LABELER" | "REVIEWER" | "SYSTEM";
export type UserStatus = "ACTIVE" | "DISABLED";

export interface UserVO {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthSessionVO {
  expiresAt: string;
}

export interface LoginResponseVO {
  user: UserVO;
  session: AuthSessionVO;
}

export interface LogoutResponseVO {
  success: boolean;
}

export interface QuickLoginProfile {
  role: Exclude<UserRole, "SYSTEM">;
  title: string;
  description: string;
  email: string;
}
