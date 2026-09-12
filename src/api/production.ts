/** Выпуск продукции: прогноз и факт на день. DTO повторяют
 *  app/production/schemas.py.
 *
 * День сохраняется ЦЕЛИКОМ (PUT со списком строк), а не построчно: план на день
 * существует в одном экземпляре, и так исключается вторая строка по тому же
 * продукту. Повторная отправка того же листа ничего не меняет.
 *
 * Тот же модуль есть в кабинете сотрудника (peka_staff) — ручка одна, данные
 * общие; менять DTO надо в обоих местах согласованно.
 */
import { api } from "@/api/client";

export interface ProductionPlanRow {
  production_plan_id: number;
  plan_date: string;
  product_id: number;
  product_name: string;
  /** Базовая единица продукта: «20» без «шт» не читается. */
  unit_name: string | null;
  /** Decimal приезжает строкой. null — «не заполняли»; «0» — «ничего не вышло». */
  planned_quantity: string | null;
  actual_quantity: string | null;
  /** Уже проведено на склад готовой продукции. */
  posted_quantity: string;
  last_document_id: number | null;
  note: string | null;
  updated_at: string | null;
}

export interface ProductionPlanLineIn {
  product_id: number;
  planned_quantity?: string | null;
  actual_quantity?: string | null;
  note?: string | null;
}

export async function getProductionPlan(date: string): Promise<ProductionPlanRow[]> {
  const { data } = await api.get<ProductionPlanRow[]>("/production-plan", {
    params: { date },
  });
  return data;
}

/** Сводка за период — те же строки за несколько дат. */
export async function getProductionPlanPeriod(
  from: string,
  to: string,
): Promise<ProductionPlanRow[]> {
  const { data } = await api.get<ProductionPlanRow[]>("/production-plan", {
    params: { from, to },
  });
  return data;
}

export async function saveProductionPlan(
  plan_date: string,
  lines: ProductionPlanLineIn[],
): Promise<ProductionPlanRow[]> {
  const { data } = await api.put<ProductionPlanRow[]>("/production-plan", {
    plan_date,
    lines,
  });
  return data;
}

export async function deleteProductionPlanRow(id: number): Promise<void> {
  await api.delete(`/production-plan/${id}`);
}

export interface ProductionReleaseLine {
  product_id: number;
  product_name: string;
  quantity: string;
}

export interface ProductionReleaseOut {
  document_id: number;
  document_number: number | null;
  lines: ProductionReleaseLine[];
  rows: ProductionPlanRow[];
}

export async function postProductionPlan(body: {
  plan_date: string;
  warehouse_id: number;
  target_warehouse_id: number;
}): Promise<ProductionReleaseOut> {
  const { data } = await api.post<ProductionReleaseOut>("/production-plan/post", body);
  return data;
}
