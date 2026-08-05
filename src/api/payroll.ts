/** API layer for the "payroll" module (справочник оплаты, табель, ведомости,
 * займы, реестр выплат). DTOs mirror app/payroll/schemas.py 1:1 (snake_case,
 * Decimal -> string). */
import { api } from "@/api/client";
import type { Page, PageParams } from "@/api/client";

// ---- domain enums (app/payroll/models.py) ----
export type PayType = "shift" | "salary";
export type LegalKind = "official" | "unofficial" | "ip";
export type RunKind = "advance" | "salary";
export type RunStatus = "draft" | "approved" | "paid";
export type PayoutMethod = "card" | "cash" | "ip";
export type TimesheetStatus = "draft" | "closed";
export type TimesheetDaySource = "attendance" | "manual" | "correction";
export type LoanStatus = "active" | "closed";
export type PaymentKind = "advance" | "salary" | "loan_issue" | "vacation" | "other";

// ==== оформление (юрлица) ====
export interface LegalEntityOut {
  legal_entity_id: number;
  organization_id: number;
  name: string;
  kind: LegalKind;
  is_active: boolean;
  created_at: string;
}

export interface LegalEntityCreate {
  name: string;
  kind: LegalKind;
}

export interface LegalEntityUpdate {
  name?: string;
  kind?: LegalKind;
  is_active?: boolean;
}

export async function listLegalEntities(includeInactive = false): Promise<LegalEntityOut[]> {
  const { data } = await api.get<LegalEntityOut[]>("/payroll/legal-entities", {
    params: { include_inactive: includeInactive },
  });
  return data;
}

export async function createLegalEntity(body: LegalEntityCreate): Promise<LegalEntityOut> {
  const { data } = await api.post<LegalEntityOut>("/payroll/legal-entities", body);
  return data;
}

export async function updateLegalEntity(
  id: number,
  body: LegalEntityUpdate,
): Promise<LegalEntityOut> {
  const { data } = await api.patch<LegalEntityOut>(`/payroll/legal-entities/${id}`, body);
  return data;
}

// ==== карточка оплаты ====
export interface CompensationOut {
  employee_compensation_id: number;
  organization_id: number;
  employee_id: number;
  employee_name: string | null;
  department_id: number | null;
  department_name: string | null;
  position: string | null;
  employee_status: string | null;
  pay_type: PayType;
  rate_amount: string;
  official_amount: string;
  legal_entity_id: number | null;
  legal_entity_name: string | null;
  legal_entity_kind: LegalKind | null;
  kaspi_details: string | null;
  note: string | null;
  effective_from: string;
  effective_to: string | null;
  /** «Серая часть»: null у сменщика с официальной частью (в шаблоне это «—»). */
  grey_amount: string | null;
  /** «Доля офиц.»: только у окладников. */
  official_share: string | null;
}

export interface CompensationUpsert {
  pay_type: PayType;
  rate_amount: string;
  official_amount?: string;
  legal_entity_id?: number | null;
  kaspi_details?: string | null;
  note?: string | null;
  effective_from?: string | null;
}

export interface CompensationListParams extends PageParams {
  department_id?: number;
  pay_type?: PayType;
  legal_entity_id?: number;
  /** "active" | "terminated" | "all" */
  employee_status?: string;
  q?: string;
}

export async function listCompensations(
  params: CompensationListParams,
): Promise<Page<CompensationOut>> {
  const { data } = await api.get<Page<CompensationOut>>("/payroll/compensations", { params });
  return data;
}

export async function upsertCompensation(
  employeeId: number,
  body: CompensationUpsert,
): Promise<CompensationOut> {
  const { data } = await api.put<CompensationOut>(
    `/payroll/compensations/${employeeId}`,
    body,
  );
  return data;
}

// ==== табель ====
export interface TimesheetOut {
  timesheet_id: number;
  organization_id: number;
  period_year: number;
  period_month: number;
  advance_cutoff_day: number;
  status: TimesheetStatus;
  closed_at: string | null;
  created_at: string;
}

export interface TimesheetCreate {
  period_year: number;
  period_month: number;
  advance_cutoff_day?: number;
}

export interface TimesheetUpdate {
  advance_cutoff_day?: number;
}

export interface TimesheetRowOut {
  employee_id: number;
  employee_name: string;
  department_name: string | null;
  position: string | null;
  pay_type: PayType;
  rate_amount: string;
  legal_entity_name: string | null;
  /** день (1..31) -> смены; дни без смен отсутствуют */
  days: Record<string, string>;
  /** день -> откуда значение (автосбор / правка / перерасчёт) */
  sources: Record<string, TimesheetDaySource>;
  shifts_advance: string;
  shifts_month: string;
}

export interface TimesheetGridOut {
  timesheet: TimesheetOut;
  days_in_month: number;
  rows: TimesheetRowOut[];
}

export interface TimesheetDayIn {
  employee_id: number;
  day: number;
  shifts: string;
}

export interface TimesheetRebuildOut {
  timesheet_id: number;
  employees_touched: number;
  days_written: number;
  days_skipped_manual: number;
}

export async function listTimesheets(params: PageParams): Promise<Page<TimesheetOut>> {
  const { data } = await api.get<Page<TimesheetOut>>("/payroll/timesheets", { params });
  return data;
}

export async function createTimesheet(body: TimesheetCreate): Promise<TimesheetOut> {
  const { data } = await api.post<TimesheetOut>("/payroll/timesheets", body);
  return data;
}

export async function getTimesheetGrid(id: number): Promise<TimesheetGridOut> {
  const { data } = await api.get<TimesheetGridOut>(`/payroll/timesheets/${id}`);
  return data;
}

export async function updateTimesheet(
  id: number,
  body: TimesheetUpdate,
): Promise<TimesheetOut> {
  const { data } = await api.patch<TimesheetOut>(`/payroll/timesheets/${id}`, body);
  return data;
}

export async function setTimesheetDays(
  id: number,
  days: TimesheetDayIn[],
): Promise<TimesheetGridOut> {
  const { data } = await api.put<TimesheetGridOut>(`/payroll/timesheets/${id}/days`, { days });
  return data;
}

export async function rebuildTimesheet(
  id: number,
  overwriteManual = false,
): Promise<TimesheetRebuildOut> {
  const { data } = await api.post<TimesheetRebuildOut>(`/payroll/timesheets/${id}/rebuild`, {
    overwrite_manual: overwriteManual,
  });
  return data;
}

export async function closeTimesheet(id: number): Promise<TimesheetOut> {
  const { data } = await api.post<TimesheetOut>(`/payroll/timesheets/${id}/close`);
  return data;
}

export async function reopenTimesheet(id: number): Promise<TimesheetOut> {
  const { data } = await api.post<TimesheetOut>(`/payroll/timesheets/${id}/reopen`);
  return data;
}

/** Ссылка на выгрузку книги за период (тот же набор листов, что в шаблоне). */
export function timesheetExportUrl(id: number): string {
  return `/payroll/timesheets/${id}/export.xlsx`;
}

// ==== ведомости ====
export interface PayrollRunOut {
  payroll_run_id: number;
  organization_id: number;
  timesheet_id: number;
  period_year: number | null;
  period_month: number | null;
  kind: RunKind;
  advance_percent: string;
  status: RunStatus;
  payout_date: string | null;
  expense_category_id: number | null;
  expense_id: number | null;
  calculated_at: string | null;
  approved_at: string | null;
  paid_at: string | null;
  note: string | null;
  created_at: string;
}

export interface PayrollRunLineOut {
  payroll_run_line_id: number;
  payroll_run_id: number;
  employee_id: number;
  row_no: number | null;
  employee_name: string;
  department_name: string | null;
  position: string | null;
  legal_entity_name: string | null;
  legal_entity_kind: LegalKind | null;
  kaspi_details: string | null;
  pay_type: PayType;
  rate_amount: string;
  official_amount: string;
  shifts: string | null;
  accrued: string;
  meal_deduction: string;
  payout_method: PayoutMethod | null;
  note: string | null;
  // аванс
  advance_limit: string | null;
  previously_paid: string;
  available: string | null;
  requested: string;
  difference: string | null;
  to_pay: string | null;
  /** Эффективное «Выдано факт»: ручная правка либо «как посчитано». */
  paid_fact: string | null;
  /** Ручная правка, если была (null = значение авто). */
  paid_fact_override: string | null;
  // зарплата
  bonus: string;
  total_accrued: string | null;
  loan_deduction: string;
  penalty: string;
  advance_card: string;
  advance_cash: string;
  total_to_pay: string | null;
  to_card: string | null;
  to_cash: string | null;
  warning: string | null;
}

export interface PayrollRunTotals {
  accrued: string;
  bonus: string;
  total_accrued: string;
  meal_deduction: string;
  loan_deduction: string;
  penalty: string;
  previously_paid: string;
  requested: string;
  to_pay: string;
  paid_fact: string;
  advance_card: string;
  advance_cash: string;
  total_to_pay: string;
  to_card: string;
  to_cash: string;
  /** Суммы «на карту» в разрезе юрлиц (блок «СВОДКА» шаблона). */
  by_legal_entity: Record<string, string>;
  /** Справочно: еда под зп по расчётам через ИП. */
  meal_ip: string;
}

export interface PayrollRunDetailOut {
  run: PayrollRunOut;
  lines: PayrollRunLineOut[];
  totals: PayrollRunTotals;
}

export interface PayrollRunCreate {
  timesheet_id: number;
  kind: RunKind;
  advance_percent?: string;
  payout_date?: string | null;
  expense_category_id?: number | null;
  note?: string | null;
}

export interface PayrollRunUpdate {
  advance_percent?: string;
  payout_date?: string | null;
  expense_category_id?: number | null;
  note?: string | null;
}

/** Правка «жёлтых» колонок шаблона; всё остальное расчётное. */
export interface PayrollRunLineUpdate {
  meal_deduction?: string;
  previously_paid?: string;
  requested?: string;
  paid_fact?: string;
  bonus?: string;
  penalty?: string;
  loan_deduction?: string;
  note?: string | null;
}

export interface PayrollRunPayIn {
  payout_date?: string | null;
  expense_category_id?: number | null;
}

export interface PayrollRunListParams extends PageParams {
  timesheet_id?: number;
  kind?: RunKind;
  status?: RunStatus;
}

export async function listPayrollRuns(
  params: PayrollRunListParams,
): Promise<Page<PayrollRunOut>> {
  const { data } = await api.get<Page<PayrollRunOut>>("/payroll/runs", { params });
  return data;
}

export async function createPayrollRun(body: PayrollRunCreate): Promise<PayrollRunOut> {
  const { data } = await api.post<PayrollRunOut>("/payroll/runs", body);
  return data;
}

export async function getPayrollRun(id: number): Promise<PayrollRunDetailOut> {
  const { data } = await api.get<PayrollRunDetailOut>(`/payroll/runs/${id}`);
  return data;
}

export async function updatePayrollRun(
  id: number,
  body: PayrollRunUpdate,
): Promise<PayrollRunOut> {
  const { data } = await api.patch<PayrollRunOut>(`/payroll/runs/${id}`, body);
  return data;
}

export async function calculatePayrollRun(id: number): Promise<PayrollRunDetailOut> {
  const { data } = await api.post<PayrollRunDetailOut>(`/payroll/runs/${id}/calculate`);
  return data;
}

export async function updatePayrollRunLine(
  runId: number,
  lineId: number,
  body: PayrollRunLineUpdate,
): Promise<PayrollRunLineOut> {
  const { data } = await api.patch<PayrollRunLineOut>(
    `/payroll/runs/${runId}/lines/${lineId}`,
    body,
  );
  return data;
}

export async function approvePayrollRun(id: number): Promise<PayrollRunOut> {
  const { data } = await api.post<PayrollRunOut>(`/payroll/runs/${id}/approve`);
  return data;
}

export async function payPayrollRun(
  id: number,
  body: PayrollRunPayIn,
): Promise<PayrollRunOut> {
  const { data } = await api.post<PayrollRunOut>(`/payroll/runs/${id}/pay`, body);
  return data;
}

// ==== займы ====
export interface LoanScheduleOut {
  employee_loan_schedule_id: number;
  period_year: number;
  period_month: number;
  amount: string;
  deducted_payroll_run_id: number | null;
}

export interface LoanScheduleIn {
  period_year: number;
  period_month: number;
  amount: string;
}

export interface LoanOut {
  employee_loan_id: number;
  organization_id: number;
  employee_id: number;
  employee_name: string | null;
  position: string | null;
  principal_amount: string;
  term_months: number | null;
  monthly_amount: string | null;
  issued_on: string | null;
  status: LoanStatus;
  request_id: number | null;
  note: string | null;
  created_at: string;
  /** «Итого по графику» листа «Займы». */
  scheduled_total: string;
  /** «Контроль» = сумма займа − график; не 0 значит график не сходится. */
  control: string;
  deducted_total: string;
  schedule: LoanScheduleOut[];
}

export interface LoanCreate {
  employee_id: number;
  principal_amount: string;
  term_months?: number | null;
  monthly_amount?: string | null;
  issued_on?: string | null;
  note?: string | null;
  schedule?: LoanScheduleIn[];
}

export interface LoanUpdate {
  principal_amount?: string;
  term_months?: number | null;
  monthly_amount?: string | null;
  issued_on?: string | null;
  status?: LoanStatus;
  note?: string | null;
  schedule?: LoanScheduleIn[];
}

export interface LoanListParams extends PageParams {
  employee_id?: number;
  status?: LoanStatus;
}

export async function listLoans(params: LoanListParams): Promise<Page<LoanOut>> {
  const { data } = await api.get<Page<LoanOut>>("/payroll/loans", { params });
  return data;
}

export async function createLoan(body: LoanCreate): Promise<LoanOut> {
  const { data } = await api.post<LoanOut>("/payroll/loans", body);
  return data;
}

export async function updateLoan(id: number, body: LoanUpdate): Promise<LoanOut> {
  const { data } = await api.patch<LoanOut>(`/payroll/loans/${id}`, body);
  return data;
}

// ==== реестр выплат ====
export interface PaymentOut {
  payroll_payment_id: number;
  organization_id: number;
  employee_id: number;
  employee_name: string | null;
  kind: PaymentKind;
  amount: string;
  method: PayoutMethod;
  legal_entity_id: number | null;
  legal_entity_name: string | null;
  paid_on: string;
  payroll_run_id: number | null;
  request_id: number | null;
  expense_id: number | null;
  note: string | null;
  created_at: string;
}

export interface PaymentCreate {
  employee_id: number;
  kind: PaymentKind;
  amount: string;
  method: PayoutMethod;
  paid_on?: string | null;
  note?: string | null;
}

export interface PaymentListParams extends PageParams {
  employee_id?: number;
  kind?: PaymentKind;
  method?: PayoutMethod;
  payroll_run_id?: number;
  from?: string;
  to?: string;
}

export async function listPayments(params: PaymentListParams): Promise<Page<PaymentOut>> {
  const { data } = await api.get<Page<PaymentOut>>("/payroll/payments", { params });
  return data;
}

export async function createPayment(body: PaymentCreate): Promise<PaymentOut> {
  const { data } = await api.post<PaymentOut>("/payroll/payments", body);
  return data;
}

// ---- питание сотрудников ----
/** Запись журнала питания: чек, пробитый на кассе со скидкой 100 %.
 *
 *  `amount` — сумма по ценам меню, она и удерживается в колонке «Питание»;
 *  `cost` — себестоимость списанного сырья (расход организации). */
export interface StaffMealLine {
  menu_item_id: number;
  name: string;
  quantity: string;
  unit_price: string;
  amount: string;
}

export interface StaffMealOut {
  staff_meal_id: number;
  employee_id: number;
  employee_name: string | null;
  check_id: number;
  check_number: number | null;
  meal_date: string;
  kind: "breakfast" | "lunch" | "dinner" | "other";
  amount: string;
  cost: string;
  note: string | null;
  status: string;
  created_at: string;
  lines: StaffMealLine[];
}

export interface StaffMealsSummaryRow {
  employee_id: number;
  employee_name: string;
  meals: number;
  amount: string;
  cost: string;
}

export interface StaffMealsSummary {
  date_from: string;
  date_to: string;
  rows: StaffMealsSummaryRow[];
  meals: number;
  amount: string;
  cost: string;
}

export interface StaffMealListParams extends PageParams {
  employee?: number;
  from?: string;
  to?: string;
  include_voided?: boolean;
}

export async function listStaffMeals(
  params: StaffMealListParams,
): Promise<Page<StaffMealOut>> {
  const { data } = await api.get<Page<StaffMealOut>>("/staff-meals", { params });
  return data;
}

export async function fetchStaffMealsSummary(params: {
  from: string;
  to: string;
  employee?: number;
}): Promise<StaffMealsSummary> {
  const { data } = await api.get<StaffMealsSummary>("/staff-meals/summary", { params });
  return data;
}

/** Аннулировать запись: удержание снимается, склад НЕ возвращается. */
export async function voidStaffMeal(id: number): Promise<StaffMealOut> {
  const { data } = await api.post<StaffMealOut>(`/staff-meals/${id}/void`);
  return data;
}

/** Скачать xlsx через axios (нужен Authorization + X-Organization-Id, поэтому
 * прямой <a href> не подходит) и отдать браузеру как файл. */
export async function downloadPayrollWorkbook(
  timesheetId: number,
  filename: string,
): Promise<void> {
  const { data } = await api.get<Blob>(timesheetExportUrl(timesheetId), {
    responseType: "blob",
  });
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
