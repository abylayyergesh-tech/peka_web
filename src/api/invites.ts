/** Invites API: приглашения в организацию по email. DTO зеркалит
 *  app/invites/schemas.py 1:1. */
import { api } from "@/api/client";

export type InviteStatus = "pending" | "accepted" | "revoked";

export interface InviteOut {
  id: number;
  organization_id: number;
  email: string;
  role: string;
  status: InviteStatus;
  invited_by: number | null;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export interface InviteCreateOut extends InviteOut {
  /** Одноразовая ссылка-приглашение (показывается только при создании). */
  invite_link: string;
  email_sent: boolean;
}

export interface InvitePublicOut {
  organization_name: string;
  email: string;
  role: string;
  user_exists: boolean;
  expires_at: string;
}

export interface InviteAcceptOut {
  access_token: string;
  refresh_token: string;
  token_type: string;
  organization_id: number;
}

export async function createInvite(
  orgId: number,
  body: { email: string; role: string },
): Promise<InviteCreateOut> {
  const { data } = await api.post<InviteCreateOut>(
    `/organizations/${orgId}/invites`,
    body,
  );
  return data;
}

export async function listInvites(orgId: number): Promise<InviteOut[]> {
  const { data } = await api.get<InviteOut[]>(`/organizations/${orgId}/invites`);
  return data;
}

export async function revokeInvite(orgId: number, inviteId: number): Promise<void> {
  await api.delete(`/organizations/${orgId}/invites/${inviteId}`);
}

/** Публично (без авторизации): что видит приглашённый по ссылке. */
export async function getInvitePublic(token: string): Promise<InvitePublicOut> {
  const { data } = await api.get<InvitePublicOut>(`/invites/${token}`);
  return data;
}

/** Публично: принять приглашение. Новый пользователь передаёт имя и пароль,
 *  существующий — пустое тело (владение ссылкой из письма = аутентификация). */
export async function acceptInvite(
  token: string,
  body: { full_name?: string; password?: string },
): Promise<InviteAcceptOut> {
  const { data } = await api.post<InviteAcceptOut>(`/invites/${token}/accept`, body);
  return data;
}
