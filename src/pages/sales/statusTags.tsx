/** Russian labels and colored Tags for sales statuses and payment methods. */
import { Tag } from "antd";

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
