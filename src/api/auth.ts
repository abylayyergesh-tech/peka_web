import { api } from "@/api/client";
import type { Me, OrganizationOut } from "@/auth/store";

export interface TokenOut {
  access_token: string;
  refresh_token: string | null;
  token_type: string;
}

export interface RegisterOut extends TokenOut {
  organization: OrganizationOut;
}

export async function login(email: string, password: string): Promise<TokenOut> {
  const { data } = await api.post<TokenOut>("/auth/login", { email, password });
  return data;
}

/** Revoke the refresh token server-side (fire-and-forget on logout). */
export async function logoutApi(refresh_token: string): Promise<void> {
  await api.post("/auth/logout", { refresh_token });
}

export async function forgotPassword(email: string): Promise<void> {
  await api.post("/auth/forgot-password", { email });
}

export async function resetPassword(token: string, new_password: string): Promise<void> {
  await api.post("/auth/reset-password", { token, new_password });
}

/** Меняет пароль; все прочие refresh-токены отзываются, возвращается новая пара. */
export async function changePassword(
  current_password: string,
  new_password: string,
): Promise<TokenOut> {
  const { data } = await api.post<TokenOut>("/auth/change-password", {
    current_password,
    new_password,
  });
  return data;
}

export async function register(body: {
  email: string;
  password: string;
  full_name: string;
  organization_name: string;
}): Promise<RegisterOut> {
  const { data } = await api.post<RegisterOut>("/auth/register", body);
  return data;
}

export async function fetchMe(): Promise<Me> {
  const { data } = await api.get<Me>("/auth/me");
  return data;
}

export interface MyCapabilities {
  membership_id: number;
  role_id: number | null;
  effective: string[];
  grants: string[];
  denies: string[];
}

export async function fetchMyCapabilities(): Promise<MyCapabilities> {
  const { data } = await api.get<MyCapabilities>("/me/capabilities");
  return data;
}

export async function createOrganization(name: string): Promise<OrganizationOut> {
  const { data } = await api.post<OrganizationOut>("/organizations", { name });
  return data;
}
