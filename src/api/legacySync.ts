/** Сверка со старым сервисом заказов (app.pekarelli.kz → iiko).
 *
 *  Синхронизация раз в минуту повторяет заказы старого сервиса через наш
 *  портальный API и пишет исход каждого (`app/legacy_sync` в peka_rsm). Типы —
 *  1:1 со схемами `app/legacy_sync/schemas.py`. */
import { api } from "@/api/client";
import type { Page } from "@/api/client";

export type SyncOrderStatus =
  | "pending" | "placed" | "rejected" | "unmapped" | "failed" | "skipped" | "cancelled";

export interface SyncRunOut {
  started_at: string;
  finished_at: string | null;
  ok: boolean;
  stats: Record<string, number> | null;
  error: string | null;
}

export interface SyncStatusOut {
  enabled: boolean;
  last_run: SyncRunOut | null;
  last_ok_at: string | null;
  failed_in_row: number;
}

export interface DaySummaryOut {
  day: string;
  total: number;
  placed: number;
  rejected: number;
  unmapped: number;
  failed: number;
  pending: number;
  cancelled: number;
  skipped: number;
  external_sum: string;
  our_sum: string;
  mismatched: number;
  diff_sum: string;
}

export interface ReasonOut {
  status: SyncOrderStatus;
  error_code: string | null;
  error_message: string | null;
  count: number;
}

export interface SummaryOut {
  days: DaySummaryOut[];
  reasons: ReasonOut[];
}

export interface LegacyLine {
  product_id: string | null;
  iiko_id: string | null;
  name: string;
  quantity: string;
  price_per_unit: string;
  price: string;
}

export interface SyncOrderOut {
  legacy_sync_order_id: number;
  external_id: string;
  cart_key: string | null;
  external_created_at: string;
  placed_at: string | null;
  delivery_date: string | null;
  external_status: string | null;
  status: SyncOrderStatus;
  customer_id: number | null;
  customer_name: string | null;
  address_label: string | null;
  external_total: string | null;
  our_total: string | null;
  order_id: number | null;
  order_number: number | null;
  http_status: number | null;
  error_code: string | null;
  error_message: string | null;
  error_details: Record<string, unknown> | null;
  external_lines: LegacyLine[] | null;
  attempts: number;
  resent_from: string | null;
  replayed_at: string | null;
}

export interface SyncProductOut {
  legacy_sync_product_id: number;
  external_id: string;
  name: string;
  menu_item_id: number | null;
  menu_item_name: string | null;
  match: "auto" | "manual" | "ignored" | "none";
  seen_count: number;
}

export async function getSyncStatus(): Promise<SyncStatusOut> {
  const { data } = await api.get<SyncStatusOut>("/legacy-sync/status");
  return data;
}

export async function getSyncSummary(params: {
  date_from?: string; date_to?: string;
} = {}): Promise<SummaryOut> {
  const { data } = await api.get<SummaryOut>("/legacy-sync/summary", { params });
  return data;
}

export async function listSyncOrders(params: {
  status?: SyncOrderStatus; day?: string; mismatch?: boolean; limit: number; offset: number;
}): Promise<Page<SyncOrderOut>> {
  const { data } = await api.get<Page<SyncOrderOut>>("/legacy-sync/orders", { params });
  return data;
}

export async function retrySyncOrder(id: number): Promise<SyncOrderOut> {
  const { data } = await api.post<SyncOrderOut>(`/legacy-sync/orders/${id}/retry`);
  return data;
}

export async function listSyncProducts(match?: SyncProductOut["match"]): Promise<SyncProductOut[]> {
  const { data } = await api.get<SyncProductOut[]>("/legacy-sync/products", {
    params: match ? { match } : {},
  });
  return data;
}

export async function updateSyncProduct(
  id: number, body: { menu_item_id: number | null; ignored: boolean },
): Promise<SyncProductOut> {
  const { data } = await api.patch<SyncProductOut>(`/legacy-sync/products/${id}`, body);
  return data;
}

// ---- iiko: заказы за день и что с ними сделано у нас ----
export type IikoKind = "site" | "direct" | "staff_meal" | "unpaid";
export type IikoStatus = "matched" | "applied" | "unmatched" | "imported" | "skipped" | "failed";

export interface IikoOrderOut {
  legacy_sync_iiko_order_id: number;
  business_date: string;
  order_num: number | null;
  external_number: string | null;
  kind: IikoKind;
  counteragent: string | null;
  pay_type: string | null;
  quantity: string;
  total: string;
  discount: string;
  status: IikoStatus;
  order_id: number | null;
  note: string | null;
  lines: { dish_id: string; name: string; quantity: string; amount: string; amount_net: string }[] | null;
}

export interface IikoKindSummary {
  kind: IikoKind;
  status: IikoStatus;
  orders: number;
  quantity: string;
  total: string;
}

export interface IikoDayOut {
  day: string;
  summary: IikoKindSummary[];
  orders: IikoOrderOut[];
}

export async function getIikoDay(day?: string): Promise<IikoDayOut> {
  const { data } = await api.get<IikoDayOut>("/legacy-sync/iiko", { params: day ? { day } : {} });
  return data;
}
