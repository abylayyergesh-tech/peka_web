/** Shared bits for the staff/attendance pages: labels, status tags, formatters. */
import { Tag } from "antd";

import type {
  DisciplinaryKind,
  EmployeePresence,
  LeaveKind,
  MedicalAlert,
  Role,
} from "@/api/staff";

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

export const PRESENCE_LABELS: Record<EmployeePresence, string> = {
  at_work: "На работе",
  vacation: "В отпуске",
  sick: "На больничном",
  day_off: "В отгуле",
};

export function PresenceTag({ presence }: { presence: EmployeePresence }) {
  if (presence === "vacation") return <Tag color="blue">В отпуске</Tag>;
  if (presence === "sick") return <Tag color="orange">На больничном</Tag>;
  if (presence === "day_off") return <Tag color="cyan">В отгуле</Tag>;
  return <Tag color="green">На работе</Tag>;
}

export const LEAVE_KIND_LABELS: Record<LeaveKind, string> = {
  vacation: "Отпуск",
  sick: "Больничный",
  day_off: "Отгул",
};

export function LeaveKindTag({ kind }: { kind: LeaveKind }) {
  if (kind === "day_off") return <Tag color="cyan">Отгул</Tag>;
  return kind === "sick" ? (
    <Tag color="orange">Больничный</Tag>
  ) : (
    <Tag color="blue">Отпуск</Tag>
  );
}

export const DISCIPLINARY_LABELS: Record<DisciplinaryKind, string> = {
  remark: "Замечание",
  reprimand: "Выговор",
  severe_reprimand: "Строгий выговор",
  other: "Иное",
};

export const DISCIPLINARY_OPTIONS = (
  Object.keys(DISCIPLINARY_LABELS) as DisciplinaryKind[]
).map((v) => ({ value: v, label: DISCIPLINARY_LABELS[v] }));

export function DisciplinaryKindTag({ kind }: { kind: DisciplinaryKind }) {
  const color =
    kind === "severe_reprimand" ? "red" : kind === "reprimand" ? "volcano" : "gold";
  return <Tag color={color}>{DISCIPLINARY_LABELS[kind] ?? kind}</Tag>;
}

export function MedicalAlertTag({ alert, daysLeft }: { alert: MedicalAlert; daysLeft: number }) {
  if (alert === "expired") {
    return <Tag color="red">Просрочена ({Math.abs(daysLeft)} дн.)</Tag>;
  }
  if (alert === "expiring") {
    return <Tag color="orange">До конца {daysLeft} дн.</Tag>;
  }
  return <Tag color="green">Действует</Tag>;
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

// ---- отметки из приложения: споры и переработки ----
export const DISPUTE_REASON_LABELS: Record<string, string> = {
  out_of_zone: "вне зоны",
  mock_location: "подмена GPS",
  rooted_device: "root / jailbreak",
  out_of_schedule: "вне графика",
  new_device: "новый телефон",
};

export function DisputeTag({ status }: { status: string | null }) {
  if (status === "pending") return <Tag color="orange">спорная</Tag>;
  if (status === "accepted") return <Tag color="green">принята</Tag>;
  if (status === "rejected") return <Tag color="red">отклонена</Tag>;
  return null;
}

export function OvertimeTag({ status }: { status: string | null }) {
  if (status === "pending") return <Tag color="gold">переработка ждёт решения</Tag>;
  if (status === "approved") return <Tag color="green">переработка принята</Tag>;
  if (status === "rejected") return <Tag>переработка не принята</Tag>;
  return null;
}

/** "08:00:00" → "08:00". */
export function hhmm(time: string | null | undefined): string {
  return time ? time.slice(0, 5) : "—";
}
