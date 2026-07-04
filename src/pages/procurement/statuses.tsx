/** RU labels + colored tags for procurement statuses. */
import { Tag } from "antd";

import type { PayableSourceType, PaymentStatus, POStatus } from "@/api/procurement";

export const PO_STATUS_LABELS: Record<POStatus, string> = {
  draft: "Черновик",
  placed: "Размещён",
  partially_received: "Частично получен",
  received: "Получен",
  closed: "Закрыт",
  cancelled: "Отменён",
};

const PO_STATUS_COLORS: Record<POStatus, string> = {
  draft: "default",
  placed: "blue",
  partially_received: "gold",
  received: "green",
  closed: "cyan",
  cancelled: "red",
};

export const PO_STATUS_OPTIONS = (Object.keys(PO_STATUS_LABELS) as POStatus[]).map((s) => ({
  value: s,
  label: PO_STATUS_LABELS[s],
}));

export function POStatusTag({ status }: { status: POStatus }) {
  return (
    <Tag color={PO_STATUS_COLORS[status] ?? "default"}>{PO_STATUS_LABELS[status] ?? status}</Tag>
  );
}

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  active: "Активен",
  voided: "Аннулирован",
};

export function PaymentStatusTag({ status }: { status: PaymentStatus }) {
  return (
    <Tag color={status === "voided" ? "red" : "green"}>
      {PAYMENT_STATUS_LABELS[status] ?? status}
    </Tag>
  );
}

export const LEDGER_SOURCE_LABELS: Record<PayableSourceType, string> = {
  receipt: "Поставка",
  payment: "Оплата",
  payment_void: "Отмена оплаты",
};
