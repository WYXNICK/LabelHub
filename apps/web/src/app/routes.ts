import type { UserRole } from "../features/auth/types";

export const roleHomePath: Record<UserRole, string> = {
  OWNER: "/owner/foundation",
  LABELER: "/labeler/marketplace",
  REVIEWER: "/reviewer/foundation",
  SYSTEM: "/login",
};

export const rolePathPrefix: Record<UserRole, string> = {
  OWNER: "/owner",
  LABELER: "/labeler",
  REVIEWER: "/reviewer",
  SYSTEM: "/system",
};

export function isRolePathAllowed(role: UserRole, path: string): boolean {
  return path === rolePathPrefix[role] || path.startsWith(`${rolePathPrefix[role]}/`);
}

export function navigate(path: string): void {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
