import { apiRequest } from "../../shared/api/client";
import type { HealthVO } from "../../shared/types/api";
import type { LoginRequest, LoginResponseVO, LogoutResponseVO, UserVO } from "./types";

export function getHealth(): Promise<HealthVO> {
  return apiRequest<HealthVO>("/api/health");
}

export function login(request: LoginRequest): Promise<LoginResponseVO> {
  return apiRequest<LoginResponseVO>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function getCurrentUser(): Promise<UserVO> {
  return apiRequest<UserVO>("/api/auth/me");
}

export function logout(): Promise<LogoutResponseVO> {
  return apiRequest<LogoutResponseVO>("/api/auth/logout", {
    method: "POST",
  });
}
