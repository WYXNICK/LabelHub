import type { ApiErrorVO } from "../types/api";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiClientError extends Error {
  readonly status: number;
  readonly payload: ApiErrorVO | null;

  constructor(status: number, payload: ApiErrorVO | null) {
    super(payload?.error.message ?? `HTTP ${status}`);
    this.name = "ApiClientError";
    this.status = status;
    this.payload = payload;
  }
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  return JSON.parse(text);
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  const payload = await parseJson(response);

  if (!response.ok) {
    throw new ApiClientError(response.status, payload as ApiErrorVO | null);
  }

  return payload as T;
}
