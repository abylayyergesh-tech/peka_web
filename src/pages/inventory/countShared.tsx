/** Общее для экранов инвентаризационной сессии: подписи состояний и теги.
 *
 *  Отдельным файлом, потому что одни и те же три состояния сессии и четыре
 *  состояния строки читают три экрана (список, лист, отчёт), и расхождение в
 *  подписях между ними означало бы, что «недостача» на одном экране и на другом —
 *  это как будто разные вещи. */
import { Tag, Tooltip } from "antd";

import type { RowStatus, SessionStatus } from "@/api/counting";

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  open: "Идёт",
  posted: "Проведена",
  cancelled: "Отменена",
};

const SESSION_STATUS_COLORS: Record<SessionStatus, string> = {
  open: "processing",
  posted: "green",
  cancelled: "default",
};

const SESSION_STATUS_HINTS: Record<SessionStatus, string> = {
  open: "Обход идёт: факт вносится и сохраняется, остатки пока не тронуты",
  posted: "Закрыта с проводкой: остатки равны факту, расхождения ушли в учёт",
  cancelled: "Закрыта без проводки: остатки не менялись, лист остался историей",
};

export function SessionStatusTag({ status }: { status: SessionStatus }) {
  return (
    <Tooltip title={SESSION_STATUS_HINTS[status]}>
      <Tag color={SESSION_STATUS_COLORS[status]}>
        {SESSION_STATUS_LABELS[status] ?? status}
      </Tag>
    </Tooltip>
  );
}

export const ROW_STATUS_LABELS: Record<RowStatus, string> = {
  match: "сходится",
  shortage: "недостача",
  surplus: "излишек",
  uncounted: "не считали",
};

const ROW_STATUS_COLORS: Record<RowStatus, string> = {
  match: "green",
  shortage: "red",
  surplus: "gold",
  uncounted: "default",
};

export function RowStatusTag({ status }: { status: RowStatus }) {
  return (
    <Tag color={ROW_STATUS_COLORS[status]} style={{ marginInlineEnd: 0 }}>
      {ROW_STATUS_LABELS[status]}
    </Tag>
  );
}

/** Число со знаком: недостача красным, излишек зелёным. Ноль без знака. */
export function signed(value: string | number | null | undefined): {
  text: string;
  color?: string;
} {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n === 0) return { text: "0" };
  const text = `${n > 0 ? "+" : ""}${n.toLocaleString("ru-RU", {
    maximumFractionDigits: 3,
  })}`;
  return { text, color: n < 0 ? "#cf1322" : "#389e0d" };
}

/** Строка «что двигалось» для подсказки над количеством движений. */
export function movementsHint(m: {
  receipt: string;
  write_off: string;
  transfer_in: string;
  transfer_out: string;
  production: string;
  sale: string;
  inventory_count: string;
}): string {
  const parts: string[] = [];
  const add = (label: string, v: string) => {
    const n = Number(v);
    if (n !== 0) parts.push(`${label} ${signed(n).text}`);
  };
  add("приход", m.receipt);
  add("списание", m.write_off);
  add("перемещение +", m.transfer_in);
  add("перемещение −", m.transfer_out);
  add("производство", m.production);
  add("продажи", m.sale);
  add("пересчёт", m.inventory_count);
  return parts.length ? parts.join(", ") : "движений не было";
}
