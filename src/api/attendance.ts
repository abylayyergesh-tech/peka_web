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
export interface AttendanceShiftOut {
  attendance_shift_id: number;
  organization_id: number;
  employee_id: number;
  employee_name: string | null;
  work_location_id: number;
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
}

/** Editable fields on a shift correction (recomputes worked_minutes). */
export interface AttendanceShiftUpdate {
  work_location_id?: number;
  clock_in_at?: string;
  clock_out_at?: string | null;
}

/** Force-close an open shift with a supplied clock_out_at (> clock_in_at). */
export interface AttendanceShiftClose {
  clock_out_at: string;
}

export interface ClockInIn {
  work_location_id: number;
  latitude: number;
  longitude: number;
}

export interface ClockOutIn {
  latitude: number;
  longitude: number;
}

export interface WorkLocationListParams extends PageParams {
  include_inactive?: boolean;
}

export interface ShiftListParams extends PageParams {
  employee_id?: number;
  work_location_id?: number;
  status?: string;
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

export async function clockIn(body: ClockInIn): Promise<AttendanceShiftOut> {
  const { data } = await api.post<AttendanceShiftOut>("/me/attendance/clock-in", body);
  return data;
}

export async function clockOut(body: ClockOutIn): Promise<AttendanceShiftOut> {
  const { data } = await api.post<AttendanceShiftOut>("/me/attendance/clock-out", body);
  return data;
}
