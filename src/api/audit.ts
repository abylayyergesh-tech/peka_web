/** Audit API: журнал действий организации (нужен member.manage). */
import { api } from "@/api/client";
import type { Page, PageParams } from "@/api/client";

export interface AuditEventOut {
  id: number;
  organization_id: number | null;
  user_id: number | null;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
}

export async function listAuditEvents(
  params: PageParams & { action?: string },
): Promise<Page<AuditEventOut>> {
  const { data } = await api.get<Page<AuditEventOut>>("/audit-events", { params });
  return data;
}
