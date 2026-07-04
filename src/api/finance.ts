/** Finance module API: expense categories, expenses, accounting periods, reports.
 * DTO types mirror app/finance/schemas.py 1:1 (snake_case, money as string). */
import { api } from "@/api/client";
import type { Page, PageParams } from "@/api/client";

/** Payment method enum (app/finance/schemas.py: Literal). */
export type PaymentMethod = "cash" | "card" | "bank" | "other";

// ---- expense categories ----
export interface ExpenseCategoryOut {
  id: number;
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
  id: number;
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

// ---- accounting periods ----
export interface AccountingPeriodOut {
  id: number;
  organization_id: number;
  year: number;
  month: number;
  status: string;
  closed_at: string | null;
}

export interface PeriodRef {
  year: number;
  month: number;
}

/** Returns closed periods only (backend list_closed_periods). */
export async function listPeriods(): Promise<AccountingPeriodOut[]> {
  const { data } = await api.get<AccountingPeriodOut[]>("/accounting-periods");
  return data;
}

export async function closePeriod(body: PeriodRef): Promise<AccountingPeriodOut> {
  const { data } = await api.post<AccountingPeriodOut>("/accounting-periods/close", body);
  return data;
}

export async function reopenPeriod(body: PeriodRef): Promise<AccountingPeriodOut> {
  const { data } = await api.post<AccountingPeriodOut>("/accounting-periods/reopen", body);
  return data;
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

// ---- suppliers (cross-module ref for expense form/filter; any org member) ----
export interface SupplierRef {
  id: number;
  name: string;
}

export async function listSuppliersRef(): Promise<SupplierRef[]> {
  const { data } = await api.get<Page<SupplierRef>>("/suppliers", {
    params: { active: true, limit: 200 },
  });
  return data.items;
}
