/** Axios instance + shared API types. Every module api file imports from here. */
import axios, { AxiosError } from "axios";

import { useAuthStore } from "@/auth/store";

/** Uniform backend error envelope: {code, message, details}. */
export interface ApiErrorBody {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

/** Uniform limit/offset page envelope (matches app.core.pagination.Page). */
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface PageParams {
  limit?: number;
  offset?: number;
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
});

api.interceptors.request.use((config) => {
  const { token, activeOrgId } = useAuthStore.getState();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (activeOrgId != null) config.headers["X-Organization-Id"] = String(activeOrgId);
  return config;
});

api.interceptors.response.use(undefined, (error: AxiosError<ApiErrorBody>) => {
  // Expired/invalid token -> drop the session; the router redirects to /login.
  // Auth endpoints are exempt so a wrong password doesn't "log out" the form.
  const url = error.config?.url ?? "";
  if (error.response?.status === 401 && !url.startsWith("/auth/")) {
    useAuthStore.getState().logout();
  }
  return Promise.reject(error);
});

/** Human-readable message from an API error (for antd message/notification). */
export function errorMessage(e: unknown): string {
  if (axios.isAxiosError<ApiErrorBody>(e)) {
    const body = e.response?.data;
    if (body?.message) {
      return body.code ? `${body.message} (${body.code})` : body.message;
    }
    if (e.response?.status === 422) return "Проверьте правильность заполнения полей";
    if (e.code === "ERR_NETWORK") return "Сервер недоступен";
    return e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

/** Error code from the envelope, if any (for branching on business rules). */
export function errorCode(e: unknown): string | undefined {
  if (axios.isAxiosError<ApiErrorBody>(e)) return e.response?.data?.code;
  return undefined;
}
