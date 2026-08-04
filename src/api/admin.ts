/** API-слой модуля «Администрирование»: участники организации (tenancy) + RBAC.
 *
 * DTO 1:1 соответствуют app/tenancy/schemas.py и app/rbac/schemas.py.
 * Эндпоинты участников (tenancy) требуют member.manage; эндпоинты RBAC
 * (роли, права, назначение роли, оверрайды) — role.manage.
 */
import { api } from "@/api/client";

// ---------- tenancy: участники ----------

/** app.tenancy.schemas.MemberOut */
export interface MemberOut {
  membership_id: number;
  organization_id: number;
  user_id: number;
  role: string;
  full_name: string | null;
  email: string | null;
}

/** Значения enum app.core.roles.Role — только их принимает tenancy-API.
 * ВНИМАНИЕ: встроенная роль "hr-admin" сеется в БД, но в enum её НЕТ. */
export const TENANCY_ROLE_NAMES = ["owner", "manager", "employee"] as const;

/** Встроенные роли, сеемые в каждой организации (app.core.capabilities). */
export const BUILTIN_ROLE_NAMES = ["owner", "manager", "employee", "hr-admin"] as const;

export async function listMembers(organizationId: number): Promise<MemberOut[]> {
  const { data } = await api.get<MemberOut[]>(`/organizations/${organizationId}/members`);
  return data;
}

export async function addMember(
  organizationId: number,
  body: { email: string; role: string },
): Promise<MemberOut> {
  const { data } = await api.post<MemberOut>(`/organizations/${organizationId}/members`, body);
  return data;
}

/** Смена роли по ИМЕНИ встроенной роли (owner/manager/employee) — tenancy,
 * достаточно member.manage. Для произвольных ролей см. assignRole (RBAC). */
export async function updateMemberRole(
  organizationId: number,
  membershipId: number,
  role: string,
): Promise<MemberOut> {
  const { data } = await api.patch<MemberOut>(
    `/organizations/${organizationId}/members/${membershipId}`,
    { role },
  );
  return data;
}

export interface MemberPasswordOut {
  membership_id: number;
  email: string;
  full_name: string | null;
  /** Заполнен ТОЛЬКО когда пароль сгенерировал сервер: другого шанса увидеть
   *  его не будет — в базе лежит хэш. */
  password: string | null;
}

/** Выдать участнику пароль вместо него.
 *
 *  Для цеха это единственный работающий путь: у сотрудников технические адреса в
 *  нероутируемом домене `.local`, и письмо-приглашение туда не уйдёт. Без
 *  `password` сервер сгенерирует пароль и вернёт его один раз. Все сессии этого
 *  пользователя гасятся. */
export async function setMemberPassword(
  organizationId: number,
  membershipId: number,
  password?: string,
): Promise<MemberPasswordOut> {
  const { data } = await api.post<MemberPasswordOut>(
    `/organizations/${organizationId}/members/${membershipId}/password`,
    { password: password || null },
  );
  return data;
}

export async function removeMember(
  organizationId: number,
  membershipId: number,
): Promise<void> {
  await api.delete(`/organizations/${organizationId}/members/${membershipId}`);
}

// ---------- rbac: реестр прав и роли ----------

/** app.rbac.schemas.CapabilityOut */
export interface CapabilityOut {
  key: string;
  description: string;
}

/** app.rbac.schemas.RoleOut */
export interface RoleOut {
  role_id: number;
  name: string;
  description: string | null;
  is_builtin: boolean;
  is_protected: boolean;
  capabilities: string[];
}

/** app.rbac.schemas.MemberCapabilitiesOut */
export interface MemberCapabilitiesOut {
  membership_id: number;
  role_id: number | null;
  effective: string[];
  grants: string[];
  denies: string[];
}

export type OverrideEffect = "grant" | "deny";

export async function listCapabilities(): Promise<CapabilityOut[]> {
  const { data } = await api.get<CapabilityOut[]>("/capabilities");
  return data;
}

export async function listRoles(): Promise<RoleOut[]> {
  const { data } = await api.get<RoleOut[]>("/roles");
  return data;
}

export async function createRole(body: {
  name: string;
  description?: string;
  capabilities: string[];
}): Promise<RoleOut> {
  const { data } = await api.post<RoleOut>("/roles", body);
  return data;
}

export async function updateRole(
  roleId: number,
  body: Partial<{ name: string; description: string; capabilities: string[] }>,
): Promise<RoleOut> {
  const { data } = await api.patch<RoleOut>(`/roles/${roleId}`, body);
  return data;
}

export async function deleteRole(roleId: number): Promise<void> {
  await api.delete(`/roles/${roleId}`);
}

// ---------- rbac: роль участника и индивидуальные права ----------

/** Назначение роли по role_id (в т.ч. кастомной/hr-admin) — требует role.manage. */
export async function assignRole(
  membershipId: number,
  roleId: number,
): Promise<MemberCapabilitiesOut> {
  const { data } = await api.put<MemberCapabilitiesOut>(
    `/members/${membershipId}/role`,
    { role_id: roleId },
  );
  return data;
}

export async function memberCapabilities(
  membershipId: number,
): Promise<MemberCapabilitiesOut> {
  const { data } = await api.get<MemberCapabilitiesOut>(
    `/members/${membershipId}/capabilities`,
  );
  return data;
}

export async function setOverride(
  membershipId: number,
  capability: string,
  effect: OverrideEffect,
): Promise<MemberCapabilitiesOut> {
  const { data } = await api.put<MemberCapabilitiesOut>(
    `/members/${membershipId}/capabilities/${capability}`,
    { effect },
  );
  return data;
}

export async function clearOverride(
  membershipId: number,
  capability: string,
): Promise<MemberCapabilitiesOut> {
  const { data } = await api.delete<MemberCapabilitiesOut>(
    `/members/${membershipId}/capabilities/${capability}`,
  );
  return data;
}
