/** Инвентаризация как сессия. DTO повторяют app/inventory/count_schemas.py 1:1.
 *
 *  Главное про количество: `counted_quantity` — это `string | null`, и null значит
 *  «до полки не дошли», а не ноль. Ноль — законный результат («полка пуста»,
 *  полная недостача). Поэтому очистка факта отправляется ЯВНЫМ null, а не пустой
 *  строкой: иначе стереть ошибочно введённую цифру было бы нечем. */
import { api } from "@/api/client";
import type { Page, PageParams } from "@/api/client";

export type SessionStatus = "open" | "posted" | "cancelled";

/** Состояние строки: сошлось / недостача / излишек / не считали. */
export type RowStatus = "match" | "shortage" | "surplus" | "uncounted";

export interface SessionWarehouseOut {
  warehouse_id: number;
  warehouse_name: string;
  /** Документ `inventory_count`, которым склад закрылся. */
  document_id: number | null;
  document_number: number | null;
  lines_total: number;
  counted: number;
  discrepancies: number;
}

export interface CountSessionOut {
  inventory_count_session_id: number;
  organization_id: number;
  name: string;
  count_date: string;
  status: SessionStatus;
  note: string | null;
  opened_by: number | null;
  opened_by_name: string | null;
  closed_by: number | null;
  closed_by_name: string | null;
  closed_at: string | null;
  created_at: string;
  /** full — всё с остатком; groups — только товары категорий `categories`. */
  scope: "full" | "groups";
  categories: string[];
  /** Кто считает в приложении («вслепую»); categories — их группы, пусто — все. */
  participants: { employee_id: number; full_name: string; categories: string[] }[];
  responsible_name: string | null;
  /** Вызывающий — участник без права проверять: учёта и денег ему не отдают. */
  blind: boolean;
  snapshot_at: string | null;
  warehouses: SessionWarehouseOut[];
  lines_total: number;
  counted: number;
  discrepancies: number;
}

export interface SessionLineOut {
  inventory_count_session_line_id: number;
  warehouse_id: number;
  product_id: number;
  product_name: string;
  sku: string | null;
  category: string | null;
  unit_id: number;
  unit_name: string;
  /** Остаток по учёту СЕЙЧАС (null — счёт вслепую). */
  current_quantity: string | null;
  /** Средняя себестоимость единицы; «0» — оценивать излишек нечем; null — без
   *  права на суммы. */
  avg_cost: string | null;
  /** Учёт на момент открытия сессии. */
  snapshot_quantity: string | null;
  /** Ответственный отправил на пересчёт. */
  recount_requested: boolean;
  /** Строку добавил участник — товара не было в листе. */
  added_by_counter: boolean;
  counted_quantity: string | null;
  price: string | null;
  /** Снимок учёта на момент внесения факта. */
  expected_quantity: string | null;
  note: string | null;
  counted_by: number | null;
  counted_by_name: string | null;
  counted_at: string | null;
  /** Расхождение и его деньги считает сервер — чтобы экраны не разошлись в
   *  арифметике с проводкой. */
  diff: string | null;
  diff_value: string | null;
  status: RowStatus;
  /** Излишек, который нечем оценить: без цены сессию не закрыть. */
  needs_price: boolean;
}

export interface CountSessionSheet {
  session: CountSessionOut;
  lines: SessionLineOut[];
}

export interface SessionMovements {
  receipt: string;
  write_off: string;
  transfer_in: string;
  transfer_out: string;
  production: string;
  sale: string;
  inventory_count: string;
  net: string;
  /** Было ли вообще хоть одно движение за период сессии. */
  any: boolean;
}

export interface CountReportRow {
  warehouse_id: number;
  warehouse_name: string;
  product_id: number;
  product_name: string;
  sku: string | null;
  category: string | null;
  unit_name: string;
  /** Учёт на момент подсчёта; расходится с `expected_quantity` — склад жил
   *  между подсчётом и закрытием. */
  expected_at_count: string | null;
  expected_quantity: string;
  /** Учёт на момент открытия сессии. */
  snapshot_quantity: string | null;
  counted_quantity: string | null;
  diff: string;
  /** Себестоимость единицы и деньги — null без права «суммы инвентаризации». */
  price: string | null;
  diff_value: string | null;
  status: RowStatus;
  recount_requested: boolean;
  added_by_counter: boolean;
  drifted: boolean;
  movements: SessionMovements;
}

export interface CountReportWarehouse {
  warehouse_id: number;
  warehouse_name: string;
  document_id: number | null;
  document_number: number | null;
  lines_total: number;
  counted: number;
  uncounted: number;
  matches: number;
  shortages: number;
  surpluses: number;
  shortage_value: string | null;
  surplus_value: string | null;
  net_value: string | null;
}

export interface CountReportTransfer {
  document_id: number;
  number: number | null;
  doc_date: string;
  product_id: number;
  product_name: string;
  quantity: string;
  from_warehouse_id: number | null;
  from_warehouse_name: string | null;
  to_warehouse_id: number | null;
  to_warehouse_name: string | null;
  /** Оба склада в охвате сессии — перемещение объясняет ПАРУ расхождений. */
  both_in_session: boolean;
}

export interface CountReportTotals {
  lines_total: number;
  counted: number;
  uncounted: number;
  matches: number;
  shortages: number;
  surpluses: number;
  shortage_value: string | null;
  surplus_value: string | null;
  net_value: string | null;
  /** Расхождение есть, а движений с начала сессии не было. */
  without_movements: number;
}

export interface CountSessionReport {
  session: CountSessionOut;
  period_from: string;
  period_to: string;
  totals: CountReportTotals;
  warehouses: CountReportWarehouse[];
  rows: CountReportRow[];
  transfers: CountReportTransfer[];
}

export interface SessionLineIn {
  warehouse_id: number;
  product_id: number;
  /** null — очистить факт; "0" — полка пуста. */
  counted_quantity: string | null;
  unit_id?: number | null;
  price?: string | null;
  note?: string | null;
}

export interface CountSessionCloseResult {
  session: CountSessionOut;
  document_ids: number[];
  posted_lines: number;
  skipped_matches: number;
}

export interface CountSessionListParams extends PageParams {
  status?: SessionStatus;
  from?: string;
  to?: string;
}

const BASE = "/inventory-count-sessions";

export async function listCountSessions(
  params: CountSessionListParams,
): Promise<Page<CountSessionOut>> {
  const { data } = await api.get<Page<CountSessionOut>>(BASE, { params });
  return data;
}

export async function createCountSession(body: {
  name: string;
  count_date?: string;
  warehouse_ids: number[];
  note?: string | null;
  /** Наполнить лист позициями с остатком (по умолчанию да). */
  prefill?: boolean;
  scope?: "full" | "groups";
  categories?: string[];
  participant_ids?: number[];
}): Promise<CountSessionOut> {
  const { data } = await api.post<CountSessionOut>(BASE, body);
  return data;
}

export async function getCountSession(id: number): Promise<CountSessionSheet> {
  const { data } = await api.get<CountSessionSheet>(`${BASE}/${id}`);
  return data;
}

export async function updateCountSession(
  id: number,
  body: {
    name?: string;
    count_date?: string;
    note?: string | null;
    add_warehouse_ids?: number[];
    prefill_added?: boolean;
    participants?: { employee_id: number; categories: string[] }[];
  },
): Promise<CountSessionOut> {
  const { data } = await api.patch<CountSessionOut>(`${BASE}/${id}`, body);
  return data;
}

/** Внести факт пачкой. Возвращает лист целиком — расхождения пересчитал сервер. */
export async function saveCountLines(
  id: number,
  lines: SessionLineIn[],
): Promise<SessionLineOut[]> {
  const { data } = await api.put<SessionLineOut[]>(`${BASE}/${id}/lines`, { lines });
  return data;
}

export async function deleteCountLine(id: number, lineId: number): Promise<void> {
  await api.delete(`${BASE}/${id}/lines/${lineId}`);
}

export async function closeCountSession(
  id: number,
  body: { allow_uncounted?: boolean; note?: string | null } = {},
): Promise<CountSessionCloseResult> {
  const { data } = await api.post<CountSessionCloseResult>(`${BASE}/${id}/close`, body);
  return data;
}

export async function cancelCountSession(id: number): Promise<CountSessionOut> {
  const { data } = await api.post<CountSessionOut>(`${BASE}/${id}/cancel`);
  return data;
}

export async function getCountReport(id: number): Promise<CountSessionReport> {
  const { data } = await api.get<CountSessionReport>(`${BASE}/${id}/report`);
  return data;
}

/** Отправить строки на пересчёт: факт сброшен, участникам — «Пересчитать». */
export async function recountLines(id: number, lineIds: number[]): Promise<void> {
  await api.post(`${BASE}/${id}/recount`, { line_ids: lineIds });
}
