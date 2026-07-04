/** Staff (personnel) API: departments + employees. Mirrors app/staff/schemas.py. */
import { api } from "@/api/client";
import type { Page, PageParams } from "@/api/client";

export type Role = "owner" | "manager" | "employee";
export type EmployeeStatus = "active" | "terminated";

// ---- departments ----
export interface DepartmentOut {
  id: number;
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
  id: number;
  organization_id: number;
  user_id: number;
  user_email: string | null;
  department_id: number | null;
  department_name: string | null;
  full_name: string;
  position: string | null;
  phone: string | null;
  hire_date: string | null;
  status: string;
  termination_date: string | null;
  personnel_no: string | null;
  created_at: string;
}

export interface EmployeeCreate {
  email: string;
  full_name: string;
  role: Role;
  position?: string | null;
  phone?: string | null;
  hire_date?: string | null;
  department_id?: number | null;
  personnel_no?: string | null;
}

export interface EmployeeUpdate {
  full_name?: string;
  position?: string | null;
  phone?: string | null;
  hire_date?: string | null;
  department_id?: number | null;
  personnel_no?: string | null;
}

export interface DepartmentListParams extends PageParams {
  include_inactive?: boolean;
}

export interface EmployeeListParams extends PageParams {
  department_id?: number;
  status?: string;
  q?: string;
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
