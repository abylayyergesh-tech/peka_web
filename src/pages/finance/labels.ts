/** Shared labels/formatters for the finance module (RU UI). */
import dayjs from "dayjs";

import type { PaymentMethod } from "@/api/finance";

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Наличные",
  card: "Карта",
  bank: "Банк",
  other: "Другое",
};

export const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Наличные" },
  { value: "card", label: "Карта" },
  { value: "bank", label: "Банк" },
  { value: "other", label: "Другое" },
];

export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return "—";
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

/** Percent value from backend ("42.50") -> "42,50 %" (or "—" when null). */
export function fmtPct(value: string | null | undefined): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return `${n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
}

/** "июль 2026" for a year/month pair. */
export function monthLabel(year: number, month: number): string {
  return dayjs().year(year).month(month - 1).date(1).format("MMMM YYYY");
}
