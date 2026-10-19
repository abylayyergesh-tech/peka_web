/** Предварительные начисления, дисциплина за месяц и ставки по должностям
 * (BACKEND_TASKS.md §10, экран «Ставки по должностям»). */
import { api } from "@/api/client";

export type EarningsBasis = "position" | "compensation" | "salary" | "none";

export interface EarningsPreview {
  month: string;
  day_shifts: number;
  night_shifts: number;
  /** Смены со спорной отметкой без решения — в сумму пока не входят. */
  on_review_shifts: number;
  day_rate: string | null;
  night_rate: string | null;
  /** null — ставки нет, посчитать не из чего. */
  amount: string | null;
  basis: EarningsBasis;
  currency: string;
  calculated_at: string;
}

export interface DisciplineItem {
  date: string;
  kind: "late" | "early_leave" | "absence";
  minutes: number | null;
  /** Только у неявок: pending — не разобрана. */
  status: "pending" | "excused" | "unexcused" | null;
  note: string | null;
}

export interface Discipline {
  month: string;
  late_count: number;
  late_minutes: number;
  early_leave_count: number;
  early_leave_minutes: number;
  /** Неявки без уважительной причины (уважительные — только в списке). */
  absence_count: number;
  items: DisciplineItem[];
}

export interface PositionRate {
  position_rate_id: number;
  position_id: number;
  day_rate: string;
  night_rate: string;
  effective_from: string;
}

export interface PositionRatesRow {
  position_id: number;
  position_name: string;
  is_active: boolean;
  employees: number;
  current: PositionRate | null;
  upcoming: PositionRate | null;
  history: PositionRate[];
}

export async function getEmployeeEarningsPreview(employeeId: number, month: string) {
  const { data } = await api.get<EarningsPreview>(
    `/employees/${employeeId}/earnings/preview`, { params: { month } });
  return data;
}

export async function getEmployeeDiscipline(employeeId: number, month: string) {
  const { data } = await api.get<Discipline>(`/employees/${employeeId}/discipline`, {
    params: { month },
  });
  return data;
}

export async function listPositionRates(): Promise<PositionRatesRow[]> {
  const { data } = await api.get<PositionRatesRow[]>("/position-rates");
  return data;
}

export async function setPositionRate(
  positionId: number,
  body: { day_rate: number; night_rate: number; effective_from: string },
): Promise<PositionRate> {
  const { data } = await api.put<PositionRate>(`/position-rates/${positionId}`, body);
  return data;
}

export async function deletePositionRate(positionRateId: number): Promise<void> {
  await api.delete(`/position-rates/rows/${positionRateId}`);
}
