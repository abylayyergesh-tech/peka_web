/** Shared UI bits for the requests module: RU labels, status/type tags,
 * payload summaries, стадии маршрута и история решений — используются обоими
 * drawer'ами (мои заявления и все заявления). */
import { Descriptions, Space, Steps, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { DescriptionsProps } from "antd";

import type {
  RequestApprovalOut,
  RequestOut,
  RequestStatus,
  RequestStepOut,
  RequestTimesheetLineOut,
  RequestType,
} from "@/api/requests";
import { fmtDate, fmtDateTime, fmtMoney } from "@/components/format";

// ---- labels ----
export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  advance: "Аванс",
  vacation: "Отпуск",
  sick_leave: "Больничный",
  resignation: "Увольнение",
  schedule: "График",
  timesheet_correction: "Перерасчёт табеля",
  loan: "Займ",
  hiring: "Приём в штат",
};

export const REQUEST_TYPE_OPTIONS = (
  Object.entries(REQUEST_TYPE_LABELS) as [RequestType, string][]
).map(([value, label]) => ({ value, label }));

/** Типы, которые сотрудник подаёт сам за себя. Приём в штат и перерасчёт
 * табеля оформляет HR (эндпоинт подачи за другого). */
export const SELF_SERVICE_TYPES: RequestType[] = [
  "advance",
  "vacation",
  "sick_leave",
  "resignation",
  "schedule",
  "loan",
];

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

/** Статус + производные теги: выплата (перевод зарегистрирован) и текущая стадия. */
export function RequestStatusTags({ req }: { req: RequestOut }) {
  const meta = STATUS_META[req.status] ?? { color: "default", label: req.status };
  return (
    <Space size={4} wrap>
      <Tag color={meta.color}>{meta.label}</Tag>
      {req.status === "pending" && req.current_step_no != null && (
        <Tag color="blue">
          Стадия {req.current_step_no}
          {req.current_step_title ? `: ${req.current_step_title}` : ""}
        </Tag>
      )}
      {req.payroll_payment_id != null && <Tag color="green">Выплата проведена</Tag>}
      {req.expense_id != null && <Tag color="cyan">Расход #{req.expense_id}</Tag>}
      {req.created_employee_id != null && (
        <Tag color="purple">Сотрудник #{req.created_employee_id}</Tag>
      )}
    </Space>
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
    case "sick_leave":
      return `${fmtDate(req.start_date)} — ${fmtDate(req.end_date)}`;
    case "resignation":
      return `Последний рабочий день: ${fmtDate(req.last_working_day)}`;
    case "schedule":
      return `Действует с: ${fmtDate(req.effective_date)}`;
    case "loan":
      return `${fmtMoney(req.amount)} на ${req.term_months ?? "—"} мес`;
    case "timesheet_correction":
      return `Табель #${req.timesheet_id ?? "—"}, дней: ${req.timesheet_days.length || "—"}`;
    case "hiring":
      return `${req.candidate_full_name ?? "—"}${
        req.candidate_position ? `, ${req.candidate_position}` : ""
      }`;
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
      label: req.type === "hiring" ? "Заявитель" : "Сотрудник",
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
    if (req.amount) {
      items.push({ key: "amount", label: "Сумма отпускных", children: fmtMoney(req.amount) });
    }
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
  if (req.type === "loan") {
    items.push(
      { key: "amount", label: "Сумма займа", children: fmtMoney(req.amount) },
      { key: "term", label: "Срок", children: req.term_months ? `${req.term_months} мес` : "—" },
      {
        key: "monthly",
        label: "Ежемесячный платёж",
        children: req.monthly_amount ? fmtMoney(req.monthly_amount) : "равными платежами",
      },
    );
  }
  if (req.type === "hiring") {
    items.push(
      { key: "candidate", label: "ФИО кандидата", children: req.candidate_full_name ?? "—" },
      { key: "position", label: "Должность", children: req.candidate_position ?? "—" },
      { key: "phone", label: "Телефон", children: req.candidate_phone ?? "—" },
      {
        key: "pay",
        label: "Оплата",
        children:
          req.candidate_pay_type == null
            ? "—"
            : `${req.candidate_pay_type === "shift" ? "Смена" : "Оклад"}: ${fmtMoney(
                req.candidate_rate_amount,
              )}${
                Number(req.candidate_official_amount ?? 0) > 0
                  ? `, офиц. часть ${fmtMoney(req.candidate_official_amount)}`
                  : ""
              }`,
      },
      { key: "hire_date", label: "Дата приёма", children: fmtDate(req.effective_date) },
    );
  }
  items.push(
    { key: "comment", label: "Комментарий", children: req.comment || "—" },
    { key: "created_at", label: "Создано", children: fmtDateTime(req.created_at) },
  );
  if (req.resolved_at) {
    items.push({ key: "resolved_at", label: "Решение принято", children: fmtDateTime(req.resolved_at) });
  }
  if (req.paid_at) {
    items.push({
      key: "paid_at",
      label: "Перевод зарегистрирован",
      children: `${fmtDateTime(req.paid_at)}${
        req.payroll_payment_id != null ? ` (выплата #${req.payroll_payment_id})` : ""
      }`,
    });
  }
  return <Descriptions column={1} size="small" bordered items={items} />;
}

const STEP_STATUS_TO_ANTD: Record<
  RequestStepOut["status"],
  "wait" | "process" | "finish" | "error"
> = {
  pending: "wait",
  approved: "finish",
  rejected: "error",
  skipped: "wait",
};

/** Маршрут согласования заявления: где оно сейчас и кто уже подписал. */
export function ApprovalSteps({ req }: { req: RequestOut }) {
  if (req.steps.length === 0) return null;
  const currentIndex = req.steps.findIndex((s) => s.step_no === req.current_step_no);
  return (
    <div style={{ marginTop: 16 }}>
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        Маршрут согласования
      </Typography.Title>
      <Steps
        direction="vertical"
        size="small"
        current={currentIndex < 0 ? req.steps.length : currentIndex}
        items={req.steps.map((s) => ({
          title: (
            <Space size={4} wrap>
              <span>{s.title || `Стадия ${s.step_no}`}</span>
              {s.is_final && <Tag color="green">подтверждение HR</Tag>}
              {s.status === "skipped" && <Tag>не потребовалась</Tag>}
            </Space>
          ),
          description: (
            <div>
              <div>
                Согласующий:{" "}
                {s.approver_user_id != null
                  ? s.approver_email ?? `Пользователь #${s.approver_user_id}`
                  : `любой с ролью «${s.approver_role}»`}
              </div>
              {s.decided_at && (
                <div>
                  {s.status === "approved" ? "Одобрил" : "Отклонил"}:{" "}
                  {s.decided_by_email ?? `Пользователь #${s.decided_by}`} ·{" "}
                  {fmtDateTime(s.decided_at)}
                </div>
              )}
              {s.comment && <div>Комментарий: {s.comment}</div>}
            </div>
          ),
          status: STEP_STATUS_TO_ANTD[s.status],
        }))}
      />
    </div>
  );
}

const TIMESHEET_LINE_COLUMNS: ColumnsType<RequestTimesheetLineOut> = [
  { title: "День", dataIndex: "day", width: 80 },
  {
    title: "Было смен",
    dataIndex: "shifts_before",
    width: 110,
    render: (v: string | null) => (v == null ? "—" : Number(v).toLocaleString("ru-RU")),
  },
  {
    title: "Станет смен",
    dataIndex: "shifts",
    width: 110,
    render: (v: string) => <b>{Number(v).toLocaleString("ru-RU")}</b>,
  },
];

/** Что именно правит заявление на перерасчёт табеля. */
export function TimesheetCorrectionLines({ req }: { req: RequestOut }) {
  if (req.type !== "timesheet_correction" || req.timesheet_days.length === 0) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        Правки табеля
      </Typography.Title>
      <Table
        rowKey="request_timesheet_line_id"
        size="small"
        dataSource={req.timesheet_days}
        columns={TIMESHEET_LINE_COLUMNS}
        pagination={false}
      />
    </div>
  );
}

const APPROVAL_COLUMNS: ColumnsType<RequestApprovalOut> = [
  {
    title: "Решение",
    dataIndex: "decision",
    width: 120,
    render: (d: RequestApprovalOut["decision"]) =>
      d === "approve" ? <Tag color="green">Одобрил</Tag> : <Tag color="red">Отклонил</Tag>,
  },
  { title: "Стадия", dataIndex: "step_no", width: 80, render: (v: number | null) => v ?? "—" },
  {
    title: "Подписант",
    dataIndex: "approver_email",
    render: (_, row) => row.approver_email ?? `Пользователь #${row.approver_user_id}`,
  },
  { title: "Комментарий", dataIndex: "comment", render: (c: string | null) => c || "—" },
  { title: "Когда", dataIndex: "created_at", width: 140, render: fmtDateTime },
];

/** История решений (только в detail-ответах). */
export function ApprovalsList({ req }: { req: RequestOut }) {
  return (
    <div style={{ marginTop: 16 }}>
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        История решений
      </Typography.Title>
      <Table
        rowKey="request_approval_id"
        size="small"
        dataSource={req.approvals}
        columns={APPROVAL_COLUMNS}
        pagination={false}
        locale={{ emptyText: "Решений пока нет" }}
      />
    </div>
  );
}
