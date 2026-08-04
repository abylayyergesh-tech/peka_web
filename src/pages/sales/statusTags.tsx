/** Russian labels and colored Tags for sales statuses and payment methods. */
import { Tag } from "antd";

import type { BillingMode } from "@/api/sales";

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Наличные",
  card: "Карта",
  credit: "В кредит",
};

export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return "—";
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

const SHIFT_STATUS: Record<string, { color: string; label: string }> = {
  open: { color: "green", label: "Открыта" },
  closed: { color: "default", label: "Закрыта" },
};

export function ShiftStatusTag({ status }: { status: string }) {
  const s = SHIFT_STATUS[status] ?? { color: "default", label: status };
  return <Tag color={s.color}>{s.label}</Tag>;
}

const CHECK_STATUS: Record<string, { color: string; label: string }> = {
  open: { color: "blue", label: "Открыт" },
  paid: { color: "green", label: "Оплачен" },
  voided: { color: "red", label: "Аннулирован" },
};

export function CheckStatusTag({ status }: { status: string }) {
  const s = CHECK_STATUS[status] ?? { color: "default", label: status };
  return <Tag color={s.color}>{s.label}</Tag>;
}

const PAYMENT_STATUS: Record<string, { color: string; label: string }> = {
  active: { color: "green", label: "Активен" },
  voided: { color: "red", label: "Аннулирован" },
};

export function PaymentStatusTag({ status }: { status: string }) {
  const s = PAYMENT_STATUS[status] ?? { color: "default", label: status };
  return <Tag color={s.color}>{s.label}</Tag>;
}

/** Категории расчётов с клиентами. Подписи развёрнутые: «раз в неделю» и «по
 *  заказу» — это разные процессы выставления счёта, а не оттенки одного. */
export const BILLING_MODE: Record<BillingMode, { color: string; label: string; hint: string }> = {
  weekly: {
    color: "gold",
    label: "Раз в неделю",
    hint: "Сводный счёт раз в неделю, оплата переводом. Отгрузки копятся в дебиторке, поступление разносится по банковской выписке.",
  },
  per_order: {
    color: "cyan",
    label: "По заказу",
    hint: "Счёт на каждый заказ в клиентском портале, оплата сразу.",
  },
};

export const BILLING_MODE_OPTIONS = (Object.keys(BILLING_MODE) as BillingMode[]).map((v) => ({
  value: v,
  label: BILLING_MODE[v].label,
}));

export function BillingModeTag({ mode }: { mode: BillingMode }) {
  const m = BILLING_MODE[mode];
  if (!m) return <Tag>{mode}</Tag>;
  return <Tag color={m.color}>{m.label}</Tag>;
}
