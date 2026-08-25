/** API layer for the "requests" module (заявления + согласования + политики).
 * DTOs mirror app/requests/schemas.py 1:1 (snake_case, Decimal -> string). */
import { api } from "@/api/client";
import type { Page, PageParams } from "@/api/client";

// ---- domain enums (app/requests/models.py) ----
export type RequestType =
  | "advance"
  | "schedule"
  | "vacation"
  | "sick_leave"
  | "resignation"
  | "timesheet_correction"
  | "loan"
  | "hiring";
export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";
export type RequestStepStatus = "pending" | "approved" | "rejected" | "skipped";
export type ApprovalDecision = "approve" | "reject";
export type PaymentMethod = "cash" | "card" | "bank" | "other";

// ---- submission: discriminated union on `type` ----
export interface AdvanceRequestCreate {
  type: "advance";
  amount: string;
  comment?: string | null;
}

export interface VacationRequestCreate {
  type: "vacation";
  start_date: string;
  end_date: string;
  is_paid: boolean;
  /** Сумма отпускных: только для оплачиваемого отпуска — именно она
   * регистрируется переводом на финальной стадии. */
  amount?: string | null;
  comment?: string | null;
}

export interface SickLeaveRequestCreate {
  type: "sick_leave";
  start_date: string;
  end_date: string;
  /** Суммы у больничного нет: его считают по среднему, а не заявлением. */
  comment?: string | null;
}

export interface ResignationRequestCreate {
  type: "resignation";
  last_working_day: string;
  comment?: string | null;
}

export interface ScheduleRequestCreate {
  type: "schedule";
  effective_date: string;
  comment?: string | null;
}

export interface LoanRequestCreate {
  type: "loan";
  amount: string;
  term_months: number;
  monthly_amount?: string | null;
  comment?: string | null;
}

export interface TimesheetCorrectionDayIn {
  day: number;
  shifts: string;
}

export interface TimesheetCorrectionRequestCreate {
  type: "timesheet_correction";
  timesheet_id: number;
  days: TimesheetCorrectionDayIn[];
  comment?: string | null;
}

export interface HiringRequestCreate {
  type: "hiring";
  candidate_full_name: string;
  candidate_position?: string | null;
  candidate_phone?: string | null;
  candidate_department_id?: number | null;
  candidate_pay_type?: "shift" | "salary" | null;
  candidate_rate_amount?: string | null;
  candidate_official_amount?: string | null;
  candidate_legal_entity_id?: number | null;
  candidate_kaspi_details?: string | null;
  hire_date?: string | null;
  comment?: string | null;
}

export type RequestCreate =
  | AdvanceRequestCreate
  | VacationRequestCreate
  | SickLeaveRequestCreate
  | ResignationRequestCreate
  | ScheduleRequestCreate
  | LoanRequestCreate
  | TimesheetCorrectionRequestCreate
  | HiringRequestCreate;

/** Подача ЗА другого сотрудника (cap request.submit_any). */
export interface RequestCreateFor {
  employee_id: number;
  request: RequestCreate;
}

// ---- actions ----
export interface ApprovalDecisionIn {
  comment?: string | null;
}

/** Pay out an approved advance -> Finance Expense. `amount` defaults to the
 * request amount; `expense_date` to today (resolved on the backend). */
export interface AdvancePayIn {
  category_id: number;
  expense_date?: string;
  amount?: string;
  payment_method?: PaymentMethod;
}

// ---- outputs ----
export interface RequestApprovalOut {
  request_approval_id: number;
  request_id: number;
  approver_user_id: number;
  approver_email: string | null;
  /** Стадия маршрута; null у старых заявлений, согласованных порогом M-of-N. */
  step_no: number | null;
  decision: ApprovalDecision;
  comment: string | null;
  created_at: string;
}

/** Снимок стадии маршрута для конкретного заявления. */
export interface RequestStepOut {
  request_step_id: number;
  request_id: number;
  step_no: number;
  title: string | null;
  approver_user_id: number | null;
  approver_email: string | null;
  approver_role: string | null;
  /** Финальная стадия = подтверждение HR, после неё регистрируется перевод. */
  is_final: boolean;
  status: RequestStepStatus;
  decided_by: number | null;
  decided_by_email: string | null;
  decided_at: string | null;
  comment: string | null;
}

export interface RequestTimesheetLineOut {
  request_timesheet_line_id: number;
  day: number;
  shifts: string;
  shifts_before: string | null;
}

export interface RequestOut {
  request_id: number;
  organization_id: number;
  employee_id: number;
  employee_name: string | null;
  type: RequestType;
  status: RequestStatus;
  required_approvals: number;
  /** Стадия, ждущая решения (null = маршрута нет или он пройден). */
  current_step_no: number | null;
  current_step_title: string | null;
  /** Может ли ТЕКУЩИЙ пользователь решить заявление прямо сейчас. */
  can_decide: boolean;
  comment: string | null;
  // per-type payload (only the relevant ones are non-null)
  amount: string | null;
  start_date: string | null;
  end_date: string | null;
  is_paid: boolean | null;
  last_working_day: string | null;
  effective_date: string | null;
  term_months: number | null;
  monthly_amount: string | null;
  timesheet_id: number | null;
  candidate_full_name: string | null;
  candidate_position: string | null;
  candidate_phone: string | null;
  candidate_department_id: number | null;
  candidate_pay_type: "shift" | "salary" | null;
  candidate_rate_amount: string | null;
  candidate_official_amount: string | null;
  candidate_legal_entity_id: number | null;
  candidate_kaspi_details: string | null;
  /** Карточка сотрудника, созданная согласованным «приёмом в штат». */
  created_employee_id: number | null;
  // resolution + payout ("paid" is derived: paid_at != null, status stays approved)
  resolved_at: string | null;
  resolved_by: number | null;
  expense_id: number | null;
  /** Перевод, зарегистрированный финальной стадией согласования. */
  payroll_payment_id: number | null;
  paid_at: string | null;
  paid_by: number | null;
  created_at: string;
  /** Detail-only (empty on list responses). */
  steps: RequestStepOut[];
  approvals: RequestApprovalOut[];
  timesheet_days: RequestTimesheetLineOut[];
}

// ---- policies ----
export interface RequestPolicyOut {
  request_policy_id: number;
  organization_id: number;
  type: RequestType;
  required_approvals: number;
}

export interface RequestPolicyUpdate {
  required_approvals: number;
}

// ---- list params ----
export interface MyRequestListParams extends PageParams {
  type?: RequestType;
  status?: RequestStatus;
}

export interface RequestListParams extends PageParams {
  employee_id?: number;
  type?: RequestType;
  status?: RequestStatus;
  /** ISO date (YYYY-MM-DD), inclusive lower bound on created_at. */
  from?: string;
  /** ISO date (YYYY-MM-DD), inclusive upper bound on created_at. */
  to?: string;
}

// ==== self-service (/me/requests) ====
export async function submitRequest(body: RequestCreate): Promise<RequestOut> {
  const { data } = await api.post<RequestOut>("/me/requests", body);
  return data;
}

export async function listMyRequests(params: MyRequestListParams): Promise<Page<RequestOut>> {
  const { data } = await api.get<Page<RequestOut>>("/me/requests", { params });
  return data;
}

export async function getMyRequest(id: number): Promise<RequestOut> {
  const { data } = await api.get<RequestOut>(`/me/requests/${id}`);
  return data;
}

export async function cancelMyRequest(id: number): Promise<RequestOut> {
  const { data } = await api.post<RequestOut>(`/me/requests/${id}/cancel`);
  return data;
}

// ==== подача за другого сотрудника (request.submit_any) ====
export async function submitRequestFor(body: RequestCreateFor): Promise<RequestOut> {
  const { data } = await api.post<RequestOut>("/requests", body);
  return data;
}

/** Заявления, ждущие решения именно этого пользователя (его стадии + стадии его роли). */
export async function listRequestsPendingForMe(
  params: PageParams,
): Promise<Page<RequestOut>> {
  const { data } = await api.get<Page<RequestOut>>("/me/requests/pending-approval", {
    params,
  });
  return data;
}

// ==== маршруты согласования (request.policy.manage) ====
export interface ApprovalFlowStepOut {
  approval_flow_step_id: number;
  approval_flow_id: number;
  step_no: number;
  title: string | null;
  approver_user_id: number | null;
  approver_email: string | null;
  approver_role: string | null;
  is_final: boolean;
}

export interface ApprovalFlowOut {
  approval_flow_id: number;
  organization_id: number;
  request_type: RequestType;
  is_active: boolean;
  steps: ApprovalFlowStepOut[];
}

export interface ApprovalFlowStepIn {
  step_no: number;
  title?: string | null;
  approver_user_id?: number | null;
  approver_role?: string | null;
  is_final: boolean;
}

export async function listApprovalFlows(): Promise<ApprovalFlowOut[]> {
  const { data } = await api.get<ApprovalFlowOut[]>("/approval-flows");
  return data;
}

/** Переписать маршрут типа целиком: ровно одна финальная стадия, и она последняя.
 * Уже поданные заявления не затрагиваются — у них снимок на момент подачи. */
export async function replaceApprovalFlow(
  type: RequestType,
  steps: ApprovalFlowStepIn[],
): Promise<ApprovalFlowOut> {
  const { data } = await api.put<ApprovalFlowOut>(`/approval-flows/${type}`, { steps });
  return data;
}

// ==== management (request.approve) ====
export async function listRequests(params: RequestListParams): Promise<Page<RequestOut>> {
  const { data } = await api.get<Page<RequestOut>>("/requests", { params });
  return data;
}

export async function getRequest(id: number): Promise<RequestOut> {
  const { data } = await api.get<RequestOut>(`/requests/${id}`);
  return data;
}

export async function approveRequest(id: number, body: ApprovalDecisionIn): Promise<RequestOut> {
  const { data } = await api.post<RequestOut>(`/requests/${id}/approve`, body);
  return data;
}

export async function rejectRequest(id: number, body: ApprovalDecisionIn): Promise<RequestOut> {
  const { data } = await api.post<RequestOut>(`/requests/${id}/reject`, body);
  return data;
}

/** Advance payout (cap finance.manage on the backend, NOT request.approve). */
export async function payRequest(id: number, body: AdvancePayIn): Promise<RequestOut> {
  const { data } = await api.post<RequestOut>(`/requests/${id}/pay`, body);
  return data;
}

// ==== policies (request.policy.manage) ====
export async function listRequestPolicies(): Promise<RequestPolicyOut[]> {
  const { data } = await api.get<RequestPolicyOut[]>("/request-policies");
  return data;
}

export async function updateRequestPolicy(
  type: RequestType,
  body: RequestPolicyUpdate,
): Promise<RequestPolicyOut> {
  const { data } = await api.patch<RequestPolicyOut>(`/request-policies/${type}`, body);
  return data;
}

// ==== finance lookup for the payout modal ====
// GET /expense-categories belongs to the finance module (cap finance.read) but no
// finance api file exists yet; the payout form needs the category Select.
export interface ExpenseCategoryOut {
  expense_category_id: number;
  organization_id: number;
  name: string;
  is_active: boolean;
}

export async function listActiveExpenseCategories(): Promise<ExpenseCategoryOut[]> {
  const { data } = await api.get<ExpenseCategoryOut[]>("/expense-categories", {
    params: { active: true },
  });
  return data;
}
