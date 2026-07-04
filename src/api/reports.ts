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
  id: number;
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

export async function getProductCost(
  productId: number,
  warehouseId: number,
): Promise<ProductCostNode> {
  const { data } = await api.get<ProductCostNode>(
    `/reports/product-cost/${productId}`,
    { params: { warehouse_id: warehouseId } },
  );
  return data;
}
