/** Staff (personnel) API: departments + employees. Mirrors app/staff/schemas.py. */
import { api } from "@/api/client";
import type { Page, PageParams } from "@/api/client";

export type Role = "owner" | "manager" | "employee";
export type EmployeeStatus = "active" | "terminated";
export type EmployeePresence = "at_work" | "vacation" | "sick";
export type LeaveKind = "vacation" | "sick";
export type DisciplinaryKind = "remark" | "reprimand" | "severe_reprimand" | "other";
export type MedicalAlert = "ok" | "expiring" | "expired";

// ---- departments ----
export interface DepartmentOut {
  department_id: number;
  organization_id: number;
  name: string;
  head_employee_id: number | null;
  head_employee_name: string | null;
  is_active: boolean;
  created_at: string;
}

export interface DepartmentCreate {
  name: string;
  head_employee_id?: number | null;
}

export interface DepartmentUpdate {
  name?: string;
  head_employee_id?: number | null;
  is_active?: boolean;
}

// ---- employees ----
export interface EmployeeOut {
  employee_id: number;
  organization_id: number;
  user_id: number;
  user_email: string | null;
  department_id: number | null;
  department_name: string | null;
  manager_id: number | null;
  manager_name: string | null;
  department_head_id: number | null;
  department_head_name: string | null;
  full_name: string;
  position: string | null;
  phone: string | null;
  hire_date: string | null;
  status: string;
  presence: EmployeePresence;
  presence_until: string | null;
  termination_date: string | null;
  personnel_no: string | null;
  created_at: string;
}

export interface EmployeeCreate {
  /** Не обязателен: без него сервер создаёт технический логин (цеху вход не
   *  нужен, а карточка в табеле нужна). С адресом, которого ещё нет, аккаунт
   *  создаётся со случайным паролем — доступ выдаётся отдельно, паролем. */
  email?: string | null;
  full_name: string;
  role: Role;
  position?: string | null;
  phone?: string | null;
  hire_date?: string | null;
  department_id?: number | null;
  manager_id?: number | null;
  personnel_no?: string | null;
}

export interface EmployeeUpdate {
  full_name?: string;
  position?: string | null;
  phone?: string | null;
  hire_date?: string | null;
  department_id?: number | null;
  manager_id?: number | null;
  personnel_no?: string | null;
}

export interface DepartmentListParams extends PageParams {
  include_inactive?: boolean;
}

export interface EmployeeListParams extends PageParams {
  department_id?: number;
  status?: string;
  q?: string;
  presence?: EmployeePresence;
}

export interface PositionHistoryOut {
  employee_position_history_id: number;
  organization_id: number;
  employee_id: number;
  position: string;
  effective_from: string;
  effective_to: string | null;
  note: string | null;
  created_at: string;
}

export interface LeavePeriodOut {
  leave_period_id: number;
  organization_id: number;
  employee_id: number;
  employee_name: string | null;
  request_id: number | null;
  kind: LeaveKind;
  start_date: string;
  end_date: string;
  is_paid: boolean;
  source: "request" | "hr";
  created_at: string;
}

export interface LeavePeriodCreate {
  kind: LeaveKind;
  start_date: string;
  end_date: string;
  is_paid?: boolean;
}

export interface MedicalBookOut {
  medical_book_id: number;
  organization_id: number;
  employee_id: number;
  employee_name: string | null;
  title: string;
  signed_on: string;
  expires_on: string;
  note: string | null;
  is_active: boolean;
  alert: MedicalAlert;
  days_left: number;
  created_at: string;
}

export interface MedicalBookCreate {
  title?: string | null;
  signed_on: string;
  expires_on: string;
  note?: string | null;
}

export interface MedicalBookUpdate {
  title?: string;
  signed_on?: string;
  expires_on?: string;
  note?: string | null;
  is_active?: boolean;
}

export interface MedicalBookAlertsOut {
  within_days: number;
  expired_count: number;
  expiring_count: number;
  items: MedicalBookOut[];
}

export interface DisciplinaryOut {
  disciplinary_id: number;
  organization_id: number;
  employee_id: number;
  employee_name: string | null;
  kind: DisciplinaryKind;
  issued_on: string;
  reason: string;
  note: string | null;
  issued_by: number | null;
  issued_by_name: string | null;
  created_at: string;
}

export interface DisciplinaryCreate {
  kind: DisciplinaryKind;
  issued_on: string;
  reason: string;
  note?: string | null;
}

// ---- department requests ----
export async function listDepartments(
  params: DepartmentListParams,
): Promise<Page<DepartmentOut>> {
  const { data } = await api.get<Page<DepartmentOut>>("/departments", { params });
  return data;
}

export async function createDepartment(body: DepartmentCreate): Promise<DepartmentOut> {
  const { data } = await api.post<DepartmentOut>("/departments", body);
  return data;
}

export async function updateDepartment(
  id: number,
  body: DepartmentUpdate,
): Promise<DepartmentOut> {
  const { data } = await api.patch<DepartmentOut>(`/departments/${id}`, body);
  return data;
}

export async function deactivateDepartment(id: number): Promise<DepartmentOut> {
  const { data } = await api.delete<DepartmentOut>(`/departments/${id}`);
  return data;
}

// ---- employee requests ----
export async function listEmployees(
  params: EmployeeListParams,
): Promise<Page<EmployeeOut>> {
  const { data } = await api.get<Page<EmployeeOut>>("/employees", { params });
  return data;
}

export async function createEmployee(body: EmployeeCreate): Promise<EmployeeOut> {
  const { data } = await api.post<EmployeeOut>("/employees", body);
  return data;
}

export async function updateEmployee(
  id: number,
  body: EmployeeUpdate,
): Promise<EmployeeOut> {
  const { data } = await api.patch<EmployeeOut>(`/employees/${id}`, body);
  return data;
}

export async function terminateEmployee(
  id: number,
  body: { termination_date?: string | null },
): Promise<EmployeeOut> {
  const { data } = await api.post<EmployeeOut>(`/employees/${id}/terminate`, body);
  return data;
}

export async function listPositionHistory(employeeId: number): Promise<PositionHistoryOut[]> {
  const { data } = await api.get<PositionHistoryOut[]>(
    `/employees/${employeeId}/position-history`,
  );
  return data;
}

export async function listEmployeeLeave(employeeId: number): Promise<LeavePeriodOut[]> {
  const { data } = await api.get<LeavePeriodOut[]>(`/employees/${employeeId}/leave-periods`);
  return data;
}

export async function createEmployeeLeave(
  employeeId: number,
  body: LeavePeriodCreate,
): Promise<LeavePeriodOut> {
  const { data } = await api.post<LeavePeriodOut>(
    `/employees/${employeeId}/leave-periods`,
    body,
  );
  return data;
}

export async function deleteEmployeeLeave(
  employeeId: number,
  leavePeriodId: number,
): Promise<void> {
  await api.delete(`/employees/${employeeId}/leave-periods/${leavePeriodId}`);
}

export async function listEmployeeMedicalBooks(
  employeeId: number,
  includeInactive = false,
): Promise<MedicalBookOut[]> {
  const { data } = await api.get<MedicalBookOut[]>(
    `/employees/${employeeId}/medical-books`,
    { params: { include_inactive: includeInactive } },
  );
  return data;
}

export async function createMedicalBook(
  employeeId: number,
  body: MedicalBookCreate,
): Promise<MedicalBookOut> {
  const { data } = await api.post<MedicalBookOut>(
    `/employees/${employeeId}/medical-books`,
    body,
  );
  return data;
}

export async function updateMedicalBook(
  employeeId: number,
  bookId: number,
  body: MedicalBookUpdate,
): Promise<MedicalBookOut> {
  const { data } = await api.patch<MedicalBookOut>(
    `/employees/${employeeId}/medical-books/${bookId}`,
    body,
  );
  return data;
}

export async function deactivateMedicalBook(
  employeeId: number,
  bookId: number,
): Promise<MedicalBookOut> {
  const { data } = await api.delete<MedicalBookOut>(
    `/employees/${employeeId}/medical-books/${bookId}`,
  );
  return data;
}

export async function listMedicalBooks(params: {
  employee_id?: number;
  include_inactive?: boolean;
  alert?: "expired" | "expiring" | "all";
  within_days?: number;
  limit?: number;
  offset?: number;
}): Promise<Page<MedicalBookOut>> {
  const { data } = await api.get<Page<MedicalBookOut>>("/employees/medical-books", {
    params,
  });
  return data;
}

export async function listMedicalBookAlerts(withinDays = 30): Promise<MedicalBookAlertsOut> {
  const { data } = await api.get<MedicalBookAlertsOut>("/employees/medical-books/alerts", {
    params: { within_days: withinDays },
  });
  return data;
}

export async function listEmployeeDisciplinaries(
  employeeId: number,
): Promise<DisciplinaryOut[]> {
  const { data } = await api.get<DisciplinaryOut[]>(
    `/employees/${employeeId}/disciplinaries`,
  );
  return data;
}

export async function createDisciplinary(
  employeeId: number,
  body: DisciplinaryCreate,
): Promise<DisciplinaryOut> {
  const { data } = await api.post<DisciplinaryOut>(
    `/employees/${employeeId}/disciplinaries`,
    body,
  );
  return data;
}

export async function deleteDisciplinary(
  employeeId: number,
  disciplinaryId: number,
): Promise<void> {
  await api.delete(`/employees/${employeeId}/disciplinaries/${disciplinaryId}`);
}

export async function listDisciplinaries(params: {
  employee_id?: number;
  kind?: DisciplinaryKind;
  limit?: number;
  offset?: number;
}): Promise<Page<DisciplinaryOut>> {
  const { data } = await api.get<Page<DisciplinaryOut>>("/employees/disciplinaries", {
    params,
  });
  return data;
}

export type ScheduleKind = "work" | "dayoff";

export interface ScheduleCellOut {
  kind: ScheduleKind | null;
  shifts: string | null;
  note: string | null;
  leave_kind: LeaveKind | null;
}

export interface ScheduleRowOut {
  employee_id: number;
  employee_name: string;
  department_id: number | null;
  department_name: string | null;
  position: string | null;
  days: Record<string, ScheduleCellOut>;
}

export interface ScheduleGridOut {
  year: number;
  month: number;
  days_in_month: number;
  department_id: number | null;
  department_name: string | null;
  rows: ScheduleRowOut[];
}

export interface ScheduleDayPut {
  employee_id: number;
  work_date: string;
  kind?: ScheduleKind | null;
  shifts?: string | null;
  note?: string | null;
}

export interface ScheduleColleagueOut {
  employee_id: number;
  full_name: string;
  department_name: string | null;
}

export interface ScheduleSwapPreviewOut {
  work_date: string;
  employee_id: number;
  giver_kind: ScheduleKind | null;
  giver_shifts: string | null;
  giver_on_leave: LeaveKind | null;
  can_offer: boolean;
  candidates: ScheduleColleagueOut[];
}

export async function getEmployeeSchedule(params: {
  year: number;
  month: number;
  department_id?: number;
}): Promise<ScheduleGridOut> {
  const { data } = await api.get<ScheduleGridOut>("/employees/schedule", { params });
  return data;
}

export async function replaceScheduleDays(
  days: ScheduleDayPut[],
): Promise<{ written: number }> {
  const { data } = await api.put<{ written: number }>("/employees/schedule/days", { days });
  return data;
}

export async function getScheduleSwapPreview(params: {
  employee_id: number;
  work_date: string;
}): Promise<ScheduleSwapPreviewOut> {
  const { data } = await api.get<ScheduleSwapPreviewOut>("/employees/schedule/swap-preview", {
    params,
  });
  return data;
}
