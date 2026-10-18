/** Attendance API: work locations, shift oversight, self-clock.
 * Mirrors app/attendance/schemas.py. Coordinates/decimals arrive as strings. */
import axios from "axios";

import { api } from "@/api/client";
import type { Page, PageParams } from "@/api/client";

export type ShiftStatus = "open" | "closed";

// ---- work locations ----
export interface WorkLocationOut {
  work_location_id: number;
  organization_id: number;
  name: string;
  latitude: string;
  longitude: string;
  radius_m: number;
  address: string | null;
  /** Цеха, которые работают на площадке (по ним приложение показывает
   *  сотруднику его геозоны). */
  department_ids: number[];
  is_active: boolean;
  created_at: string;
}

export interface WorkLocationCreate {
  name: string;
  latitude: number;
  longitude: number;
  radius_m?: number;
  address?: string | null;
  department_ids?: number[];
}

export interface WorkLocationUpdate {
  name?: string;
  latitude?: number;
  longitude?: number;
  radius_m?: number;
  address?: string | null;
  /** Передан — заменяет список цехов целиком. */
  department_ids?: number[];
  is_active?: boolean;
}

// ---- правила учёта (app.attendance.schemas.AttendanceSettings*) ----
export interface AttendanceSettings {
  late_grace_min: number;
  early_leave_grace_min: number;
  overtime_after_min: number;
  no_show_after_min: number;
  auto_close_after_min: number;
  clock_in_window_min: number;
  onboarding_grace_days: number;
  photo_retention_days: number;
  hr_contact_phone: string | null;
  hr_contact_whatsapp: string | null;
}

export async function getAttendanceSettings(): Promise<AttendanceSettings> {
  const { data } = await api.get<AttendanceSettings>("/attendance/settings");
  return data;
}

export async function saveAttendanceSettings(
  body: AttendanceSettings,
): Promise<AttendanceSettings> {
  const { data } = await api.put<AttendanceSettings>("/attendance/settings", body);
  return data;
}

// ---- attendance shifts ----
/** Отметка прихода или ухода — для разбора спорной (app.attendance.schemas.AttendanceMarkOut). */
export interface AttendanceMarkOut {
  mark_id: number;
  kind: "clock_in" | "clock_out";
  marked_at: string;
  latitude: string | null;
  longitude: string | null;
  accuracy_m: string | null;
  distance_m: number | null;
  work_location_id: number | null;
  work_location_name: string | null;
  /** Подписанная ссылка на селфи; живёт ~15 минут. */
  photo_url: string | null;
  is_mocked: boolean;
  is_rooted: boolean;
  out_of_zone: boolean;
  comment: string | null;
  dispute_status: DisputeStatus | null;
  dispute_reasons: DisputeReason[];
  decision_comment: string | null;
  decided_at: string | null;
}

export type DisputeStatus = "pending" | "accepted" | "rejected";
export type DisputeReason =
  | "out_of_zone"
  | "mock_location"
  | "rooted_device"
  | "out_of_schedule"
  | "new_device";

export interface AttendanceShiftOut {
  attendance_shift_id: number;
  organization_id: number;
  employee_id: number;
  employee_name: string | null;
  work_location_id: number | null;
  work_location_name: string | null;
  clock_in_at: string;
  clock_in_latitude: string | null;
  clock_in_longitude: string | null;
  clock_in_distance_m: number | null;
  clock_out_at: string | null;
  clock_out_latitude: string | null;
  clock_out_longitude: string | null;
  clock_out_distance_m: number | null;
  worked_minutes: number | null;
  status: string;
  is_edited: boolean;
  edited_by: number | null;
  created_at: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  shift_name: string | null;
  late_minutes: number | null;
  early_leave_minutes: number | null;
  overtime_minutes: number | null;
  overtime_status: "pending" | "approved" | "rejected" | null;
  dispute_status: DisputeStatus | null;
  dispute_reasons: DisputeReason[];
  dispute_comment: string | null;
  decision_comment: string | null;
  /** no_clock_out — смену закрыла система: ухода не было. */
  close_reason: string | null;
  clock_in_photo_url: string | null;
  clock_out_photo_url: string | null;
  marks: AttendanceMarkOut[];
}

/** Правка смены в кабинете — только с причиной (она попадает в историю). */
export interface AttendanceShiftUpdate {
  work_location_id?: number;
  clock_in_at?: string;
  clock_out_at?: string | null;
  reason: string;
}

/** Force-close an open shift with a supplied clock_out_at (> clock_in_at). */
export interface AttendanceShiftClose {
  clock_out_at: string;
  reason: string;
}

export interface AttendanceShiftEditOut {
  attendance_shift_edit_id: number;
  attendance_shift_id: number;
  edited_by: number | null;
  edited_by_name: string | null;
  edited_at: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  reason: string;
}

export interface AttendanceAbsenceOut {
  absence_id: number;
  employee_id: number;
  employee_name: string | null;
  work_date: string;
  scheduled_start: string | null;
  status: "no_show" | "excused" | "unexcused";
  comment: string | null;
  resolved_at: string | null;
}

export interface ShiftTemplateOut {
  shift_template_id: number;
  name: string;
  /** "HH:MM:SS" */
  starts_at: string;
  ends_at: string;
  is_night: boolean;
  is_active: boolean;
}

export interface WorkLocationListParams extends PageParams {
  include_inactive?: boolean;
}

export interface ShiftListParams extends PageParams {
  employee_id?: number;
  work_location_id?: number;
  status?: string;
  dispute?: DisputeStatus;
  overtime?: "pending" | "approved" | "rejected";
  close_reason?: "no_clock_out";
  from?: string;
  to?: string;
}

export interface MyShiftListParams extends PageParams {
  from?: string;
  to?: string;
}

// ---- work location requests ----
export async function listWorkLocations(
  params: WorkLocationListParams,
): Promise<Page<WorkLocationOut>> {
  const { data } = await api.get<Page<WorkLocationOut>>("/work-locations", { params });
  return data;
}

export async function createWorkLocation(
  body: WorkLocationCreate,
): Promise<WorkLocationOut> {
  const { data } = await api.post<WorkLocationOut>("/work-locations", body);
  return data;
}

export async function updateWorkLocation(
  id: number,
  body: WorkLocationUpdate,
): Promise<WorkLocationOut> {
  const { data } = await api.patch<WorkLocationOut>(`/work-locations/${id}`, body);
  return data;
}

export async function deactivateWorkLocation(id: number): Promise<WorkLocationOut> {
  const { data } = await api.delete<WorkLocationOut>(`/work-locations/${id}`);
  return data;
}

// ---- shift oversight (attendance.manage) ----
export async function listShifts(
  params: ShiftListParams,
): Promise<Page<AttendanceShiftOut>> {
  const { data } = await api.get<Page<AttendanceShiftOut>>("/attendance/shifts", { params });
  return data;
}

export async function updateShift(
  id: number,
  body: AttendanceShiftUpdate,
): Promise<AttendanceShiftOut> {
  const { data } = await api.patch<AttendanceShiftOut>(`/attendance/shifts/${id}`, body);
  return data;
}

export async function closeShift(
  id: number,
  body: AttendanceShiftClose,
): Promise<AttendanceShiftOut> {
  const { data } = await api.post<AttendanceShiftOut>(`/attendance/shifts/${id}/close`, body);
  return data;
}

// ---- self-clock (any active member with an employee profile) ----
/** Current open shift, or null when the backend returns 404 (none open). */
export async function getMyOpenShift(): Promise<AttendanceShiftOut | null> {
  try {
    const { data } = await api.get<AttendanceShiftOut>("/me/attendance/open");
    return data;
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 404) return null;
    throw e;
  }
}

export async function listMyShifts(
  params: MyShiftListParams,
): Promise<Page<AttendanceShiftOut>> {
  const { data } = await api.get<Page<AttendanceShiftOut>>("/me/attendance", { params });
  return data;
}

// Отметка прихода/ухода — только из приложения сотрудника (multipart с селфи и
// привязанным телефоном), из кабинета её не делают.

// ---- история правок, решения, неявки, шаблоны смен ----
export async function listShiftEdits(id: number): Promise<AttendanceShiftEditOut[]> {
  const { data } = await api.get<AttendanceShiftEditOut[]>(`/attendance/shifts/${id}/edits`);
  return data;
}

export async function decideMark(
  markId: number,
  decision: "accept" | "reject",
  comment?: string,
): Promise<void> {
  await api.post(`/team/marks/${markId}/decision`, { decision, comment: comment || null });
}

export async function decideOvertime(
  shiftId: number,
  decision: "approve" | "reject",
): Promise<void> {
  await api.post(`/team/overtime/${shiftId}/decision`, { decision });
}

export async function listAbsences(params: {
  status?: "no_show" | "excused" | "unexcused";
  from?: string;
  to?: string;
}): Promise<AttendanceAbsenceOut[]> {
  const { data } = await api.get<AttendanceAbsenceOut[]>("/attendance/absences", { params });
  return data;
}

export async function resolveAbsence(
  absenceId: number,
  resolution: "excused" | "unexcused",
  comment?: string,
): Promise<void> {
  await api.post(`/team/absences/${absenceId}/resolve`, { resolution, comment: comment || null });
}

export async function listShiftTemplates(includeInactive = false): Promise<ShiftTemplateOut[]> {
  const { data } = await api.get<ShiftTemplateOut[]>("/shift-templates", {
    params: includeInactive ? { include_inactive: true } : {},
  });
  return data;
}

export async function createShiftTemplate(body: {
  name: string;
  starts_at: string;
  ends_at: string;
}): Promise<ShiftTemplateOut> {
  const { data } = await api.post<ShiftTemplateOut>("/shift-templates", body);
  return data;
}

export async function updateShiftTemplate(
  id: number,
  body: Partial<{ name: string; starts_at: string; ends_at: string; is_active: boolean }>,
): Promise<ShiftTemplateOut> {
  const { data } = await api.patch<ShiftTemplateOut>(`/shift-templates/${id}`, body);
  return data;
}
