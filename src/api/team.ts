/** «Мой цех» / «Сегодня по цехам» — app/staff/team_router.py.
 *
 * Руководитель цеха видит свои цеха, HR (attendance.manage) — любой цех по
 * `department_id` или все сразу. */
import { api } from "@/api/client";

export interface TeamPerson {
  employee_id: number;
  full_name: string;
  photo_url: string | null;
  position: string | null;
  workshop_name: string | null;
  clock_in_at: string | null;
  scheduled_start: string | null;
  late_minutes: number | null;
}

export interface TeamAbsent {
  employee_id: number;
  full_name: string;
  photo_url: string | null;
  /** not_arrived — смена идёт, прихода нет; no_show — неявка записана. */
  status: "not_arrived" | "no_show";
  absence_id: number | null;
  scheduled_start: string | null;
}

export interface TeamDispute {
  mark_id: number;
  employee_id: number;
  full_name: string;
  kind: "clock_in" | "clock_out";
  marked_at: string;
  photo_url: string | null;
  reference_photo_url: string | null;
  reasons: string[];
  comment: string | null;
  distance_m: number | null;
  latitude: string | null;
  longitude: string | null;
  work_location_name: string | null;
}

export interface TeamOverview {
  date: string;
  workshops: { workshop_id: number; name: string }[];
  on_shift: TeamPerson[];
  late: TeamPerson[];
  absent: TeamAbsent[];
  disputed: TeamDispute[];
  newcomers: {
    employee_id: number;
    full_name: string;
    position: string | null;
    hired_at: string | null;
    first_shift_date: string | null;
  }[];
  onboarding_pending: {
    employee_id: number;
    full_name: string;
    onboarding_step: string | null;
    /** До этого момента отметка открыта (работал до запуска онбординга). */
    grace_until: string | null;
  }[];
  device_requests: {
    request_id: number;
    employee_id: number;
    full_name: string;
    device_model: string | null;
    requested_at: string;
  }[];
  overtime: {
    attendance_shift_id: number;
    employee_id: number;
    full_name: string;
    overtime_minutes: number;
    date: string;
  }[];
  requests_pending: number;
}

export async function getTeamOverview(params: {
  date?: string;
  department_id?: number;
}): Promise<TeamOverview> {
  const { data } = await api.get<TeamOverview>("/team/overview", { params });
  return data;
}

export async function confirmWorkplaceBriefing(employeeId: number): Promise<void> {
  await api.post(`/team/employees/${employeeId}/workplace-briefing`);
}
