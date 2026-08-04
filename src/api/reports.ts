/** Reports API (read-only). DTOs mirror app/reports/schemas.py. */
import { api } from "@/api/client";

/** Cursor pagination envelope (app.reports.schemas.CursorPage). */
export interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
  limit: number;
}

export interface StockRow {
  warehouse_id: number;
  product_id: number;
  quantity: string;
  avg_cost: string;
  cost_balance: string;
}

export interface MovementRow {
  stock_movement_id: number;
  document_id: number;
  line_id: number | null;
  product_id: number;
  warehouse_id: number;
  quantity_delta: string;
  cost_delta: string;
  quantity_after: string;
  cost_balance_after: string;
  avg_cost_after: string;
  doc_date: string;
  posting_seq: number;
}

export interface ProductCostNode {
  product_id: number;
  cost_per_base_unit: string | null;
  missing_cost: boolean;
  components: ProductCostNode[];
}

export async function getStock(params: {
  warehouse_id?: number;
  product_id?: number;
}): Promise<StockRow[]> {
  const { data } = await api.get<StockRow[]>("/reports/stock", { params });
  return data;
}

export interface MovementsParams {
  /** query aliases: from / to (ISO date). */
  from?: string;
  to?: string;
  warehouse_id?: number;
  product_id?: number;
  cursor?: string;
  limit?: number;
}

export async function getMovements(
  params: MovementsParams,
): Promise<CursorPage<MovementRow>> {
  const { data } = await api.get<CursorPage<MovementRow>>("/reports/movements", {
    params,
  });
  return data;
}

/** Себестоимость не зависит от склада: средняя одна на организацию, поэтому
 *  склад в запрос не передаётся (бэкенд его игнорирует). */
export async function getProductCost(
  productId: number,
): Promise<ProductCostNode> {
  const { data } = await api.get<ProductCostNode>(
    `/reports/product-cost/${productId}`,
  );
  return data;
}

/** Строка калькуляционной карты. Проценты потерь считает бэкенд из количеств. */
export interface TechCardRow {
  product_id: number;
  sku: string | null;
  name: string;
  kind: string;
  /** Единица строки тех-карты, как её ввели («Фасовка»). */
  unit_name: string;
  package_count: string;
  /** Количества в базовой единице продукта. */
  brutto: string;
  netto: string;
  yield_qty: string;
  /** Те же величины в килограммах; null — у товара не задан вес единицы. */
  brutto_kg: string | null;
  netto_kg: string | null;
  yield_kg: string | null;
  /** Отрицательный процент = ПРИБАВКА веса (замачивание, варка с набором воды). */
  cold_loss_pct: string | null;
  hot_loss_pct: string | null;
  unit_cost: string | null;
  cost_total: string | null;
  missing_cost: boolean;
  /** Откуда цена: остаток склада, цена последнего поступления или статья без
   *  ставки (ФОТ, аренда). null у полуфабриката — он стоит столько, сколько состав. */
  cost_source: "stock" | "last_price" | "service" | null;
  /** Деньги строки — оценка, а не факт склада. */
  cost_estimated: boolean;
  /** Дата той последней цены (только когда cost_source = last_price). */
  last_cost_at: string | null;
  children: TechCardRow[];
}

export interface TechCardPricing {
  menu_id: number | null;
  menu_label: string;
  sale_price: string | null;
  markup: string | null;
  food_cost_pct: string | null;
}

export interface TechCardTotals {
  brutto_kg: string | null;
  netto_kg: string | null;
  yield_kg: string | null;
  /** true — часть строк в вес не попала: у них не задан вес базовой единицы. */
  missing_weight: boolean;
  cost: string | null;
  missing_cost: boolean;
  /** Хотя бы одна строка оценена, а не взята с остатка. */
  cost_estimated: boolean;
}

export interface TechCard {
  product_id: number;
  sku: string | null;
  name: string;
  output_quantity: string;
  output_unit_name: string;
  rows: TechCardRow[];
  totals: TechCardTotals;
  pricing: TechCardPricing;
}

/** Калькуляционная карта (только просмотр).
 *
 *  Цена продажи зависит от прайс-листа, по которому клиент делает заказ, поэтому
 *  меню выбирается здесь же: `menu_id` — конкретный прайс-лист, `average` —
 *  среднее по всем, где позиция продаётся, ни того ни другого — базовые цены.
 *  На себестоимость выбор не влияет: она считается по брутто. */
export async function getTechCard(
  productId: number,
  params: { menu_id?: number; average?: boolean } = {},
): Promise<TechCard> {
  const { data } = await api.get<TechCard>(`/reports/tech-card/${productId}`, {
    params,
  });
  return data;
}
