/** Finance module API: expense categories, expenses, accounting periods, reports.
 * DTO types mirror app/finance/schemas.py 1:1 (snake_case, money as string). */
import { api } from "@/api/client";
import type { Page, PageParams } from "@/api/client";

/** Payment method enum (app/finance/schemas.py: Literal). */
export type PaymentMethod = "cash" | "card" | "bank" | "other";

// ---- expense categories ----
export interface ExpenseCategoryOut {
  expense_category_id: number;
  organization_id: number;
  name: string;
  is_active: boolean;
}

export interface ExpenseCategoryCreate {
  name: string;
}

export interface ExpenseCategoryUpdate {
  name?: string;
  is_active?: boolean;
}

export async function listExpenseCategories(active?: boolean): Promise<ExpenseCategoryOut[]> {
  const { data } = await api.get<ExpenseCategoryOut[]>("/expense-categories", {
    params: active == null ? {} : { active },
  });
  return data;
}

export async function createExpenseCategory(body: ExpenseCategoryCreate): Promise<ExpenseCategoryOut> {
  const { data } = await api.post<ExpenseCategoryOut>("/expense-categories", body);
  return data;
}

export async function updateExpenseCategory(
  id: number,
  body: ExpenseCategoryUpdate,
): Promise<ExpenseCategoryOut> {
  const { data } = await api.patch<ExpenseCategoryOut>(`/expense-categories/${id}`, body);
  return data;
}

/** Soft-delete (DELETE sets is_active=false on the backend). */
export async function deactivateExpenseCategory(id: number): Promise<ExpenseCategoryOut> {
  const { data } = await api.delete<ExpenseCategoryOut>(`/expense-categories/${id}`);
  return data;
}

// ---- expenses ----
export interface ExpenseOut {
  expense_id: number;
  organization_id: number;
  expense_date: string;
  category_id: number;
  amount: string;
  note: string | null;
  supplier_id: number | null;
  payment_method: string | null;
}

export interface ExpenseCreate {
  expense_date: string;
  category_id: number;
  amount: string;
  note?: string | null;
  supplier_id?: number | null;
  payment_method?: PaymentMethod | null;
}

export type ExpenseUpdate = Partial<ExpenseCreate>;

/** Query params for GET /expenses (backend aliases: from/to/category/supplier). */
export interface ExpenseFilters extends PageParams {
  from?: string;
  to?: string;
  category?: number;
  supplier?: number;
}

export async function listExpenses(params: ExpenseFilters): Promise<Page<ExpenseOut>> {
  const { data } = await api.get<Page<ExpenseOut>>("/expenses", { params });
  return data;
}

export async function createExpense(body: ExpenseCreate): Promise<ExpenseOut> {
  const { data } = await api.post<ExpenseOut>("/expenses", body);
  return data;
}

export async function updateExpense(id: number, body: ExpenseUpdate): Promise<ExpenseOut> {
  const { data } = await api.patch<ExpenseOut>(`/expenses/${id}`, body);
  return data;
}

export async function deleteExpense(id: number): Promise<void> {
  await api.delete(`/expenses/${id}`);
}


// ---- reports ----
export interface PnLReport {
  date_from: string;
  date_to: string;
  revenue: string;
  revenue_by_method: Record<string, string>;
  cogs: string;
  gross_profit: string;
  opex: string;
  opex_by_category: Record<string, string>;
  inventory_losses: string;
  net_profit: string;
  gross_margin_pct: string | null;
  net_margin_pct: string | null;
}

/** Exactly one window: (from & to) OR (year & month). */
export interface PnLParams {
  from?: string;
  to?: string;
  year?: number;
  month?: number;
}

export async function fetchPnl(params: PnLParams): Promise<PnLReport> {
  const { data } = await api.get<PnLReport>("/reports/pnl", { params });
  return data;
}

export interface FinancialSummary {
  ap_total: string;
  ar_total: string;
}

export async function fetchFinancialSummary(): Promise<FinancialSummary> {
  const { data } = await api.get<FinancialSummary>("/reports/financial-summary");
  return data;
}

// ---- продажи по товарам ----
export interface ProductSalesRow {
  product_id: number;
  sku: string | null;
  name: string;
  category: string | null;
  quantity: string;
  /** Сумма строк чеков со скидкой строки; без скидки чека и доставки. */
  revenue: string;
  replacement_quantity: string;
  check_count: number;
  avg_price: string | null;
  cost: string;
  profit: string;
  margin_pct: string | null;
  food_cost_pct: string | null;
  /** Продано, а себестоимость нулевая — она не посчитана, прибыль завышена. */
  cost_missing: boolean;
}

export interface SalesByProductTotals {
  check_count: number;
  quantity: string;
  revenue_lines: string;
  check_discount_total: string;
  delivery_total: string;
  revenue_checks: string;
  cost: string;
  profit: string;
  margin_pct: string | null;
  positions: number;
}

export interface SalesByProductReport {
  date_from: string;
  date_to: string;
  rows: ProductSalesRow[];
  totals: SalesByProductTotals;
}

export interface ReportRangeParams {
  from: string;
  to: string;
  customer?: number;
  menu?: number;
}

export async function fetchSalesByProduct(
  params: ReportRangeParams,
): Promise<SalesByProductReport> {
  const { data } = await api.get<SalesByProductReport>("/reports/sales-by-product", {
    params,
  });
  return data;
}

// ---- ABC ----
export type AbcMetric = "revenue" | "profit" | "quantity";

export interface AbcRow extends ProductSalesRow {
  abc_class: "A" | "B" | "C";
  metric_value: string;
  share_pct: string;
  cumulative_pct: string;
}

export interface AbcClassSummary {
  abc_class: "A" | "B" | "C";
  positions: number;
  metric_value: string;
  share_pct: string;
  revenue: string;
  profit: string;
}

export interface AbcReport {
  date_from: string;
  date_to: string;
  metric: AbcMetric;
  a_pct: string;
  b_pct: string;
  rows: AbcRow[];
  classes: AbcClassSummary[];
  metric_total: string;
}

export async function fetchAbc(
  params: ReportRangeParams & { metric?: AbcMetric; a_pct?: number; b_pct?: number },
): Promise<AbcReport> {
  const { data } = await api.get<AbcReport>("/reports/abc", { params });
  return data;
}

// ---- движение денег ----
export interface CashFlowLine {
  source: string;
  label: string;
  amount: string;
}

export interface CashFlowDay {
  day: string;
  inflow: string;
  outflow: string;
  net: string;
}

export interface CashFlowReport {
  date_from: string;
  date_to: string;
  inflow_total: string;
  outflow_total: string;
  net: string;
  inflow: CashFlowLine[];
  outflow: CashFlowLine[];
  by_day: CashFlowDay[];
}

export async function fetchCashFlow(params: {
  from: string;
  to: string;
}): Promise<CashFlowReport> {
  const { data } = await api.get<CashFlowReport>("/reports/cash-flow", { params });
  return data;
}

// ---- suppliers (cross-module ref for expense form/filter; any org member) ----
export interface SupplierRef {
  supplier_id: number;
  name: string;
}

export async function listSuppliersRef(): Promise<SupplierRef[]> {
  const { data } = await api.get<Page<SupplierRef>>("/suppliers", {
    params: { active: true, limit: 200 },
  });
  return data.items;
}
