/** Shared UI bits for the requests module: RU labels, status/type tags,
 * payload summaries, стадии маршрута и история решений — используются обоими
 * drawer'ами (мои заявления и все заявления). */
import { PaperClipOutlined } from "@ant-design/icons";
import { Descriptions, Space, Steps, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { DescriptionsProps } from "antd";
import { useQuery } from "@tanstack/react-query";

import {
  listRequestTypes,
  type BuiltinRequestType,
  type RequestApprovalOut,
  type RequestOut,
  type RequestStatus,
  type RequestStepOut,
  type RequestTimesheetLineOut,
  type RequestType,
  type RequestTypeOut,
} from "@/api/requests";
import { fmtDate, fmtDateTime, fmtMoney } from "@/components/format";

// ---- labels ----
/** Подписи встроенных типов — пока справочник не загрузился. Свои типы
 * организации и переименованные HR — из справочника (useRequestTypes). */
export const REQUEST_TYPE_LABELS: Record<BuiltinRequestType, string> & Record<string, string> = {
  advance: "Аванс",
  vacation: "Отпуск",
  day_off: "Отгул",
  sick_leave: "Больничный",
  resignation: "Увольнение",
  certificate: "Справка с места работы",
  schedule: "Обмен смены",
  timesheet_correction: "Перерасчёт табеля",
  loan: "Займ",
  hiring: "Приём в штат",
};

/** Встроенные типы со своей формой — у остальных общая форма по виду. */
export const OWN_FORM_TYPES: string[] = [
  "advance", "vacation", "sick_leave", "resignation", "schedule", "loan",
  "timesheet_correction", "hiring",
];

export const REQUEST_KIND_LABELS: Record<string, string> = {
  amount: "Сумма",
  date_range: "Период",
  single_date: "Одна дата",
  none: "Без полей",
  special: "Своя форма",
};

/** Справочник типов организации: названия, виды, порядок. */
export function useRequestTypes() {
  const query = useQuery({ queryKey: ["request-types"], queryFn: listRequestTypes,
    staleTime: 60_000 });
  const types: RequestTypeOut[] = query.data ?? [];
  const names: Record<string, string> = { ...REQUEST_TYPE_LABELS };
  for (const t of types) names[t.code] = t.name_ru;
  const options = (types.length ? types : Object.keys(REQUEST_TYPE_LABELS).map((code) => ({
    code, name_ru: REQUEST_TYPE_LABELS[code], is_active: true }))).map((t) => ({
    value: t.code, label: t.is_active ? t.name_ru : `${t.name_ru} (выключен)` }));
  return { types, names, options, byCode: new Map(types.map((t) => [t.code, t])),
    isPending: query.isPending };
}

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

export function RequestTypeTag({ type, name }: { type: RequestType; name?: string | null }) {
  return <Tag>{name ?? REQUEST_TYPE_LABELS[type] ?? type}</Tag>;
}

/** Согласованный денежный запрос без выплаты — ждёт бухгалтерию. */
export function awaitsPayout(req: RequestOut): boolean {
  return (
    req.status === "approved" &&
    ["advance", "loan", "vacation"].includes(req.type) &&
    req.payroll_payment_id == null &&
    req.amount != null &&
    (req.type !== "vacation" || !!req.is_paid)
  );
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
      {awaitsPayout(req) && <Tag color="orange">Не выплачено</Tag>}
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
      return `${fmtDate(req.effective_date)} → ${
        req.counterpart_employee_name ??
        (req.counterpart_employee_id != null ? `сотрудник #${req.counterpart_employee_id}` : "—")
      }`;
    case "loan":
      return `${fmtMoney(req.amount)} на ${req.term_months ?? "—"} мес`;
    case "timesheet_correction":
      return `Табель #${req.timesheet_id ?? "—"}, дней: ${req.timesheet_days.length || "—"}`;
    case "hiring":
      return `${req.candidate_full_name ?? "—"}${
        req.candidate_position ? `, ${req.candidate_position}` : ""
      }`;
    default: {
      // Отгул, справка и свои типы: общие поля.
      const parts: string[] = [];
      if (req.amount) parts.push(`Сумма: ${fmtMoney(req.amount)}`);
      if (req.start_date) parts.push(`${fmtDate(req.start_date)} — ${fmtDate(req.end_date)}`);
      if (req.date) parts.push(fmtDate(req.date));
      if (req.attachments?.length) parts.push(`фото: ${req.attachments.length}`);
      return parts.join(", ") || req.comment || "—";
    }
  }
}

/** Detail card for the drawers. `showEmployee` — on the management page only. */
export function RequestDetails({ req, showEmployee }: { req: RequestOut; showEmployee?: boolean }) {
  const items: NonNullable<DescriptionsProps["items"]> = [
    { key: "type", label: "Тип", children: req.type_name ?? REQUEST_TYPE_LABELS[req.type] ?? req.type },
    { key: "status", label: "Статус", children: <RequestStatusTags req={req} /> },
  ];
  if (showEmployee) {
    items.push({
      key: "employee",
      label:
        req.type === "hiring"
          ? "Заявитель"
          : req.type === "schedule"
            ? "Отдаёт смену"
            : "Сотрудник",
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
    if (!showEmployee) {
      items.push({
        key: "giver",
        label: "Отдаёт смену",
        children: req.employee_name ?? `Сотрудник #${req.employee_id}`,
      });
    }
    items.push(
      { key: "effective_date", label: "Дата смены", children: fmtDate(req.effective_date) },
      {
        key: "counterpart",
        label: "Принимает смену",
        children:
          req.counterpart_employee_name ??
          (req.counterpart_employee_id != null
            ? `Сотрудник #${req.counterpart_employee_id}`
            : "—"),
      },
    );
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
  if (!OWN_FORM_TYPES.includes(req.type)) {
    if (req.amount) items.push({ key: "amount", label: "Сумма", children: fmtMoney(req.amount) });
    if (req.start_date) {
      items.push({ key: "period", label: "Период",
        children: `${fmtDate(req.start_date)} — ${fmtDate(req.end_date)}` });
    }
    if (req.date) items.push({ key: "date", label: "Дата", children: fmtDate(req.date) });
  }
  if (req.attachments?.length) {
    items.push({
      key: "attachments",
      label: "Фото документа",
      children: (
        <Space direction="vertical" size={2}>
          {req.attachments.map((a) => (
            <a key={a.attachment_id} href={a.url ?? undefined} target="_blank" rel="noreferrer">
              <PaperClipOutlined /> {a.file_name}
            </a>
          ))}
        </Space>
      ),
    });
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

/** Кто решает стадию — по-человечески. */
export function stepApprover(s: Pick<RequestStepOut, "approver_user_id" | "approver_email" |
  "approver_role" | "approver_kind"> & { approver_department_name?: string | null }): string {
  if (s.approver_kind === "department_manager") {
    return s.approver_department_name
      ? `руководитель цеха «${s.approver_department_name}»`
      : "руководитель цеха заявителя";
  }
  if (s.approver_kind === "hr") return "HR — любой с правом согласования заявлений";
  if (s.approver_user_id != null) return s.approver_email ?? `Пользователь #${s.approver_user_id}`;
  return `любой с ролью «${s.approver_role}»`;
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
              <div>Согласующий: {stepApprover(s)}</div>
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
