/** Shared UI bits for the requests module: RU labels, status/type tags,
 * payload summaries and the detail/approvals views used by both drawers. */
import { Descriptions, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { DescriptionsProps } from "antd";

import type { RequestApprovalOut, RequestOut, RequestStatus, RequestType } from "@/api/requests";
import { fmtDate, fmtDateTime, fmtMoney } from "@/components/format";

// ---- labels ----
export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  advance: "Аванс",
  vacation: "Отпуск",
  resignation: "Увольнение",
  schedule: "График",
};

export const REQUEST_TYPE_OPTIONS = (
  Object.entries(REQUEST_TYPE_LABELS) as [RequestType, string][]
).map(([value, label]) => ({ value, label }));

const STATUS_META: Record<RequestStatus, { color: string; label: string }> = {
  pending: { color: "gold", label: "На согласовании" },
  approved: { color: "green", label: "Одобрено" },
  rejected: { color: "red", label: "Отклонено" },
  cancelled: { color: "default", label: "Отменено" },
};

export const REQUEST_STATUS_OPTIONS = (
  Object.entries(STATUS_META) as [RequestStatus, { color: string; label: string }][]
).map(([value, meta]) => ({ value, label: meta.label }));

export function RequestTypeTag({ type }: { type: RequestType }) {
  return <Tag>{REQUEST_TYPE_LABELS[type] ?? type}</Tag>;
}

/** Status tag; a paid advance additionally gets the derived «Выплачено» tag
 * (payout is not a separate backend status — it is paid_at != null). */
export function RequestStatusTags({ req }: { req: RequestOut }) {
  const meta = STATUS_META[req.status] ?? { color: "default", label: req.status };
  return (
    <>
      <Tag color={meta.color}>{meta.label}</Tag>
      {req.type === "advance" && req.paid_at != null && <Tag color="blue">Выплачено</Tag>}
    </>
  );
}

/** One-line summary of the per-type payload for table cells. */
export function describeRequest(req: RequestOut): string {
  switch (req.type) {
    case "advance":
      return `Сумма: ${fmtMoney(req.amount)}`;
    case "vacation":
      return `${fmtDate(req.start_date)} — ${fmtDate(req.end_date)}${
        req.is_paid ? ", оплачиваемый" : ", без сохранения оплаты"
      }`;
    case "resignation":
      return `Последний рабочий день: ${fmtDate(req.last_working_day)}`;
    case "schedule":
      return `Действует с: ${fmtDate(req.effective_date)}`;
    default:
      return "—";
  }
}

/** Detail card for the drawers. `showEmployee` — on the management page only. */
export function RequestDetails({ req, showEmployee }: { req: RequestOut; showEmployee?: boolean }) {
  const items: NonNullable<DescriptionsProps["items"]> = [
    { key: "type", label: "Тип", children: REQUEST_TYPE_LABELS[req.type] ?? req.type },
    { key: "status", label: "Статус", children: <RequestStatusTags req={req} /> },
  ];
  if (showEmployee) {
    items.push({
      key: "employee",
      label: "Сотрудник",
      children: req.employee_name ?? `Сотрудник #${req.employee_id}`,
    });
  }
  if (req.type === "advance") {
    items.push({ key: "amount", label: "Сумма", children: fmtMoney(req.amount) });
  }
  if (req.type === "vacation") {
    items.push(
      { key: "period", label: "Период", children: `${fmtDate(req.start_date)} — ${fmtDate(req.end_date)}` },
      { key: "is_paid", label: "Оплата", children: req.is_paid ? "Оплачиваемый" : "Без сохранения оплаты" },
    );
  }
  if (req.type === "resignation") {
    items.push({
      key: "last_working_day",
      label: "Последний рабочий день",
      children: fmtDate(req.last_working_day),
    });
  }
  if (req.type === "schedule") {
    items.push({ key: "effective_date", label: "Действует с", children: fmtDate(req.effective_date) });
  }
  items.push(
    { key: "comment", label: "Комментарий", children: req.comment || "—" },
    { key: "required", label: "Требуется одобрений", children: req.required_approvals },
    { key: "created_at", label: "Создано", children: fmtDateTime(req.created_at) },
  );
  if (req.resolved_at) {
    items.push({ key: "resolved_at", label: "Решение принято", children: fmtDateTime(req.resolved_at) });
  }
  if (req.type === "advance" && req.paid_at) {
    items.push({
      key: "paid_at",
      label: "Выплачено",
      children: `${fmtDateTime(req.paid_at)} (расход #${req.expense_id ?? "—"})`,
    });
  }
  return <Descriptions column={1} size="small" bordered items={items} />;
}

const APPROVAL_COLUMNS: ColumnsType<RequestApprovalOut> = [
  {
    title: "Решение",
    dataIndex: "decision",
    width: 120,
    render: (d: RequestApprovalOut["decision"]) =>
      d === "approve" ? <Tag color="green">Одобрил</Tag> : <Tag color="red">Отклонил</Tag>,
  },
  {
    title: "Подписант",
    dataIndex: "approver_email",
    render: (_, row) => row.approver_email ?? `Пользователь #${row.approver_user_id}`,
  },
  { title: "Комментарий", dataIndex: "comment", render: (c: string | null) => c || "—" },
  { title: "Когда", dataIndex: "created_at", width: 140, render: fmtDateTime },
];

/** Approval history (detail responses only) with the M-of-N progress header. */
export function ApprovalsList({ req }: { req: RequestOut }) {
  const approved = req.approvals.filter((a) => a.decision === "approve").length;
  return (
    <div style={{ marginTop: 16 }}>
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        Согласования: {approved} из {req.required_approvals}
      </Typography.Title>
      <Table
        rowKey="id"
        size="small"
        dataSource={req.approvals}
        columns={APPROVAL_COLUMNS}
        pagination={false}
        locale={{ emptyText: "Решений пока нет" }}
      />
    </div>
  );
}
