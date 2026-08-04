/** Общие элементы модуля payroll: русские подписи, теги статусов, форматтеры
 * смен и месяцев. */
import { Tag, Tooltip } from "antd";

import type {
  LegalKind,
  PayType,
  PayoutMethod,
  PaymentKind,
  RunKind,
  RunStatus,
  TimesheetDaySource,
  TimesheetStatus,
} from "@/api/payroll";

export const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

export const MONTH_OPTIONS = MONTH_NAMES.map((label, i) => ({ value: i + 1, label }));

export function periodLabel(year: number | null, month: number | null): string {
  if (year == null || month == null) return "—";
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export const PAY_TYPE_LABELS: Record<PayType, string> = {
  shift: "Смена",
  salary: "Оклад",
};

export const PAY_TYPE_OPTIONS = (Object.keys(PAY_TYPE_LABELS) as PayType[]).map((v) => ({
  value: v,
  label: PAY_TYPE_LABELS[v],
}));

export const LEGAL_KIND_LABELS: Record<LegalKind, string> = {
  official: "Официально",
  unofficial: "Неофициально",
  ip: "Расчёты через ИП",
};

export const LEGAL_KIND_OPTIONS = (Object.keys(LEGAL_KIND_LABELS) as LegalKind[]).map(
  (v) => ({ value: v, label: LEGAL_KIND_LABELS[v] }),
);

export const RUN_KIND_LABELS: Record<RunKind, string> = {
  advance: "Аванс",
  salary: "Зарплата",
};

export const RUN_KIND_OPTIONS = (Object.keys(RUN_KIND_LABELS) as RunKind[]).map((v) => ({
  value: v,
  label: RUN_KIND_LABELS[v],
}));

const RUN_STATUS_META: Record<RunStatus, { color: string; label: string }> = {
  draft: { color: "gold", label: "Черновик" },
  approved: { color: "blue", label: "Утверждена" },
  paid: { color: "green", label: "Проведена" },
};

export const RUN_STATUS_OPTIONS = (Object.keys(RUN_STATUS_META) as RunStatus[]).map((v) => ({
  value: v,
  label: RUN_STATUS_META[v].label,
}));

export function RunStatusTag({ status }: { status: RunStatus }) {
  const meta = RUN_STATUS_META[status] ?? { color: "default", label: status };
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

export function TimesheetStatusTag({ status }: { status: TimesheetStatus }) {
  return status === "draft" ? (
    <Tag color="gold">Открыт</Tag>
  ) : (
    <Tag color="default">Закрыт</Tag>
  );
}

export const PAYOUT_METHOD_LABELS: Record<PayoutMethod, string> = {
  card: "На карту",
  cash: "Наличными",
  ip: "Через ИП",
};

export function PayoutMethodTag({ method }: { method: PayoutMethod | null }) {
  if (!method) return <>—</>;
  const color = method === "card" ? "blue" : method === "cash" ? "orange" : "default";
  return <Tag color={color}>{PAYOUT_METHOD_LABELS[method]}</Tag>;
}

export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  advance: "Аванс",
  salary: "Зарплата",
  loan_issue: "Выдача займа",
  vacation: "Отпускные",
  other: "Прочее",
};

export const PAYMENT_KIND_OPTIONS = (Object.keys(PAYMENT_KIND_LABELS) as PaymentKind[]).map(
  (v) => ({ value: v, label: PAYMENT_KIND_LABELS[v] }),
);

/** Смены: "1.50" -> "1,5"; ноль/пусто -> "—". */
export function fmtShifts(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n) || n === 0) return "—";
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

/** Доля офиц. "0.4667" -> "47%". */
export function fmtShare(value: string | null | undefined): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

const SOURCE_META: Record<TimesheetDaySource, { color: string; title: string }> = {
  attendance: { color: "#1677ff", title: "Автосбор из отметок" },
  manual: { color: "#d48806", title: "Правка вручную" },
  correction: { color: "#c41d7f", title: "Согласованный перерасчёт" },
};

/** Клетка табеля: цвет говорит, откуда взялось значение. */
export function ShiftCell({
  value,
  source,
}: {
  value: string | undefined;
  source: TimesheetDaySource | undefined;
}) {
  if (value == null || Number(value) === 0) {
    return <span style={{ color: "#bfbfbf" }}>·</span>;
  }
  const meta = source ? SOURCE_META[source] : undefined;
  const text = (
    <span
      style={{
        color: meta?.color,
        fontWeight: source === "correction" ? 600 : 400,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {fmtShifts(value)}
    </span>
  );
  return meta ? <Tooltip title={meta.title}>{text}</Tooltip> : text;
}

/** Предупреждения расчёта («начислено меньше офиц. части», «через ИП»). */
export function WarningTag({ warning }: { warning: string | null }) {
  if (!warning) return null;
  const isIp = warning.includes("ИП");
  return <Tag color={isIp ? "default" : "red"}>{warning}</Tag>;
}

/** Отрицательные суммы (перерасход по авансу) — красным, как в шаблоне. */
export function SignedMoney({ value }: { value: string | null | undefined }) {
  const n = Number(value ?? 0);
  const negative = n < 0;
  return (
    <span
      style={{
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
        color: negative ? "#cf1322" : undefined,
      }}
    >
      {value == null || value === ""
        ? "—"
        : n.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
    </span>
  );
}

/** Денежная сумма без копеек — ведомость всегда в целых тенге. */
export function fmtTenge(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}
