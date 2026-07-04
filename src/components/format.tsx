/** Shared display formatting: money (backend Decimal-as-string) and dates. */
import dayjs from "dayjs";

const CURRENCY = (import.meta.env.VITE_CURRENCY as string | undefined) ?? "";

/** "12345.60" -> "12 345,60" (+ currency suffix when configured). */
export function fmtMoney(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return String(value);
  const s = n.toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return CURRENCY ? `${s} ${CURRENCY}` : s;
}

/** Quantities: trim trailing zeros, ru-RU separators. */
export function fmtQty(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 6 });
}

export function fmtDate(value: string | null | undefined): string {
  return value ? dayjs(value).format("DD.MM.YYYY") : "—";
}

export function fmtDateTime(value: string | null | undefined): string {
  return value ? dayjs(value).format("DD.MM.YYYY HH:mm") : "—";
}

export function Money({ value }: { value: string | number | null | undefined }) {
  return <span style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(value)}</span>;
}
