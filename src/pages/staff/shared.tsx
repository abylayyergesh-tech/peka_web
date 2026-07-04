/** Shared bits for the staff/attendance pages: labels, status tags, formatters. */
import { Tag } from "antd";

import type { Role } from "@/api/staff";

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Владелец",
  manager: "Менеджер",
  employee: "Сотрудник",
};

export const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as Role[]).map((r) => ({
  value: r,
  label: ROLE_LABELS[r],
}));

export function EmployeeStatusTag({ status }: { status: string }) {
  return status === "active" ? (
    <Tag color="green">Работает</Tag>
  ) : (
    <Tag color="default">Уволен</Tag>
  );
}

export function ActiveTag({ active }: { active: boolean }) {
  return active ? <Tag color="green">Активен</Tag> : <Tag color="default">Неактивен</Tag>;
}

export function ShiftStatusTag({ status }: { status: string }) {
  return status === "open" ? (
    <Tag color="processing">Открыта</Tag>
  ) : (
    <Tag color="default">Закрыта</Tag>
  );
}

/** worked_minutes -> "8 ч 20 мин". */
export function fmtDuration(min: number | null | undefined): string {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} ч ${m} мин`;
  if (h) return `${h} ч`;
  return `${m} мин`;
}

/** Browser geolocation as a Promise (used by self clock-in/out). */
export function getPosition(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Геолокация не поддерживается этим браузером"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) =>
        reject(new Error(err.message || "Не удалось определить геопозицию")),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}
