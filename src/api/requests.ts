/** API layer for the "requests" module (заявления + согласования + политики).
 * DTOs mirror app/requests/schemas.py 1:1 (snake_case, Decimal -> string). */
import { api } from "@/api/client";
import type { Page, PageParams } from "@/api/client";

// ---- domain enums (app/requests/models.py) ----
export type RequestType = "advance" | "schedule" | "vacation" | "resignation";
export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";
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

export type RequestCreate =
  | AdvanceRequestCreate
  | VacationRequestCreate
  | ResignationRequestCreate
  | ScheduleRequestCreate;

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
  id: number;
  request_id: number;
  approver_user_id: number;
  approver_email: string | null;
  decision: ApprovalDecision;
  comment: string | null;
  created_at: string;
}

export interface RequestOut {
  id: number;
  organization_id: number;
  employee_id: number;
  employee_name: string | null;
  type: RequestType;
  status: RequestStatus;
  required_approvals: number;
  comment: string | null;
  // per-type payload (only the relevant ones are non-null)
  amount: string | null;
  start_date: string | null;
  end_date: string | null;
  is_paid: boolean | null;
  last_working_day: string | null;
  effective_date: string | null;
  // resolution + payout ("paid" is derived: paid_at != null, status stays approved)
  resolved_at: string | null;
  resolved_by: number | null;
  expense_id: number | null;
  paid_at: string | null;
  paid_by: number | null;
  created_at: string;
  /** Detail-only: decisions so far (empty on list responses). */
  approvals: RequestApprovalOut[];
}

// ---- policies ----
export interface RequestPolicyOut {
  id: number;
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
  id: number;
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
