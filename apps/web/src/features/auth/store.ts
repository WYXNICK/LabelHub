import { create } from "zustand";

import { ApiClientError } from "../../shared/api/client";
import * as authApi from "./api";
import type { LoginRequest, UserVO } from "./types";

type AuthStatus = "idle" | "loading" | "authenticated" | "anonymous";

interface AuthState {
  status: AuthStatus;
  user: UserVO | null;
  error: string | null;
  bootstrap: () => Promise<void>;
  login: (request: LoginRequest) => Promise<UserVO>;
  logout: () => Promise<void>;
}

function toMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.payload?.error.message ?? error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "请求失败，请稍后重试。";
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "idle",
  user: null,
  error: null,
  async bootstrap() {
    set({ status: "loading", error: null });
    try {
      const user = await authApi.getCurrentUser();
      set({ status: "authenticated", user, error: null });
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        set({ status: "anonymous", user: null, error: null });
        return;
      }
      set({ status: "anonymous", user: null, error: toMessage(error) });
    }
  },
  async login(request) {
    set({ status: "loading", error: null });
    try {
      const response = await authApi.login(request);
      set({ status: "authenticated", user: response.user, error: null });
      return response.user;
    } catch (error) {
      const message = toMessage(error);
      set({ status: "anonymous", user: null, error: message });
      throw error;
    }
  },
  async logout() {
    await authApi.logout();
    set({ status: "anonymous", user: null, error: null });
  },
}));
