/** Личное дело в ящике: карточка, история должностей и ставок, отпуска,
 * займы, медкнижки, взыскания, файлы. Займы и ставки — те же контуры
 * payroll, не второй справочник. */
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Checkbox,
  DatePicker,
  Descriptions,
  Empty,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import { listCompensationHistory, listLoans, type CompensationOut, type LoanOut } from "@/api/payroll";
import { listRequests, type RequestOut } from "@/api/requests";
import {
  createDisciplinary,
  createEmployeeLeave,
  createMedicalBook,
  deactivateMedicalBook,
  deleteDisciplinary,
  deleteEmployeeLeave,
  listEmployeeDisciplinaries,
  listEmployeeLeave,
  listEmployeeMedicalBooks,
  listPositionHistory,
  type DisciplinaryCreate,
  type DisciplinaryOut,
  type EmployeeOut,
  type LeaveKind,
  type LeavePeriodCreate,
  type LeavePeriodOut,
  type MedicalBookCreate,
  type MedicalBookOut,
  type PositionHistoryOut,
} from "@/api/staff";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import { fmtDate, fmtDateTime } from "@/components/format";
import { fmtTenge, PAY_TYPE_LABELS } from "@/pages/payroll/shared";
import {
  RequestStatusTags,
  RequestTypeTag,
  describeRequest,
} from "@/pages/requests/shared";
import {
  DISCIPLINARY_OPTIONS,
  DisciplinaryKindTag,
  LEAVE_KIND_LABELS,
  LeaveKindTag,
  MedicalAlertTag,
} from "@/pages/staff/shared";

export function EmployeeFileBody({
  employee,
  canManage,
  canSeeRequests,
  canPayrollRead,
  onOpenRequest,
}: {
  employee: EmployeeOut;
  canManage: boolean;
  canSeeRequests: boolean;
  canPayrollRead: boolean;
  onOpenRequest: (requestId: number) => void;
}) {
  const id = employee.employee_id;
  const boss =
    employee.manager_name ||
    (employee.department_head_name
      ? `${employee.department_head_name} (начальник отдела)`
      : null);

  return (
    <Tabs
      items={[
        {
          key: "card",
          label: "Карточка",
          children: (
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Табельный номер">
                {employee.personnel_no || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Должность">{employee.position || "—"}</Descriptions.Item>
              <Descriptions.Item label="Отдел">{employee.department_name || "—"}</Descriptions.Item>
              <Descriptions.Item label="Руководитель">{boss || "—"}</Descriptions.Item>
              {employee.manager_name && employee.department_head_name &&
                employee.manager_id !== employee.department_head_id && (
                  <Descriptions.Item label="Начальник отдела">
                    {employee.department_head_name}
                  </Descriptions.Item>
                )}
              <Descriptions.Item label="Email">{employee.user_email || "—"}</Descriptions.Item>
              <Descriptions.Item label="Телефон">{employee.phone || "—"}</Descriptions.Item>
              <Descriptions.Item label="Принят">{fmtDate(employee.hire_date)}</Descriptions.Item>
              {employee.status === "terminated" && (
                <Descriptions.Item label="Уволен">
                  {fmtDate(employee.termination_date)}
                </Descriptions.Item>
              )}
            </Descriptions>
          ),
        },
        {
          key: "positions",
          label: "Должности",
          children: <PositionHistoryTab employeeId={id} />,
        },
        {
          key: "rates",
          label: "Ставки",
          children: canPayrollRead ? (
            <RatesTab employeeId={id} />
          ) : (
            <Typography.Text type="secondary">Нет права payroll.read</Typography.Text>
          ),
        },
        {
          key: "leave",
          label: "Отпуска и больничные",
          children: <LeaveTab employeeId={id} canManage={canManage} />,
        },
        {
          key: "loans",
          label: "Займы",
          children: canPayrollRead ? (
            <LoansTab employeeId={id} />
          ) : (
            <Typography.Text type="secondary">Нет права payroll.read</Typography.Text>
          ),
        },
        {
          key: "medical",
          label: "Медкнижки",
          children: <MedicalTab employeeId={id} canManage={canManage} />,
        },
        {
          key: "discipline",
          label: "Взыскания",
          children: <DisciplineTab employeeId={id} canManage={canManage} />,
        },
        {
          key: "files",
          label: "Файлы",
          children: (
            <AttachmentsPanel
              owner={{ kind: "personnel", employeeId: id }}
              canManage={canManage}
              emptyText="В деле пока нет документов"
              uploadHint="Договор, удостоверение, заявление — pdf, фото или документ Office"
            />
          ),
        },
        ...(canSeeRequests
          ? [
              {
                key: "requests",
                label: "Заявления",
                children: (
                  <EmployeeRequests employeeId={id} onOpen={onOpenRequest} />
                ),
              },
            ]
          : []),
      ]}
    />
  );
}

function PositionHistoryTab({ employeeId }: { employeeId: number }) {
  const query = useQuery({
    queryKey: ["position-history", employeeId],
    queryFn: () => listPositionHistory(employeeId),
  });
  const columns: ColumnsType<PositionHistoryOut> = [
    { title: "Должность", dataIndex: "position" },
    { title: "С", dataIndex: "effective_from", width: 120, render: (v) => fmtDate(v) },
    {
      title: "По",
      dataIndex: "effective_to",
      width: 120,
      render: (v) => (v ? fmtDate(v) : "сейчас"),
    },
  ];
  return (
    <Table<PositionHistoryOut>
      rowKey="employee_position_history_id"
      size="small"
      loading={query.isPending}
      dataSource={query.data}
      columns={columns}
      pagination={false}
      locale={{
        emptyText: (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Истории должностей нет" />
        ),
      }}
    />
  );
}

function RatesTab({ employeeId }: { employeeId: number }) {
  const query = useQuery({
    queryKey: ["compensation-history", employeeId],
    queryFn: () => listCompensationHistory(employeeId),
  });
  const columns: ColumnsType<CompensationOut> = [
    {
      title: "Тип",
      dataIndex: "pay_type",
      width: 90,
      render: (v: CompensationOut["pay_type"]) => PAY_TYPE_LABELS[v] ?? v,
    },
    { title: "Ставка", dataIndex: "rate_amount", render: (v) => fmtTenge(v) },
    { title: "Офиц.", dataIndex: "official_amount", render: (v) => fmtTenge(v) },
    {
      title: "С",
      dataIndex: "effective_from",
      width: 110,
      render: (v) => fmtDate(v),
    },
    {
      title: "По",
      dataIndex: "effective_to",
      width: 110,
      render: (v) => (v ? fmtDate(v) : "сейчас"),
    },
  ];
  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Typography.Text type="secondary">
        Справочник ставок —{" "}
        <Link to="/payroll/compensations">HR → Справочник ставок</Link>. Здесь история
        карточек этого человека.
      </Typography.Text>
      <Table<CompensationOut>
        rowKey="employee_compensation_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data}
        columns={columns}
        pagination={false}
        locale={{
          emptyText: (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Ставок ещё не задавали" />
          ),
        }}
      />
    </Space>
  );
}

function LoansTab({ employeeId }: { employeeId: number }) {
  const query = useQuery({
    queryKey: ["payroll-loans", { employeeId }],
    queryFn: () => listLoans({ employee_id: employeeId, limit: 50, offset: 0 }),
  });
  const columns: ColumnsType<LoanOut> = [
    { title: "Сумма", dataIndex: "principal_amount", render: (v) => fmtTenge(v) },
    { title: "Выдан", dataIndex: "issued_on", width: 110, render: (v) => fmtDate(v) },
    {
      title: "Статус",
      dataIndex: "status",
      width: 100,
      render: (v) => (v === "active" ? "Активен" : "Закрыт"),
    },
    { title: "Удержано", dataIndex: "deducted_total", render: (v) => fmtTenge(v) },
  ];
  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Typography.Text type="secondary">
        Журнал займов — <Link to="/payroll/loans">HR → Фин. займы</Link>.
      </Typography.Text>
      <Table<LoanOut>
        rowKey="employee_loan_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        columns={columns}
        pagination={false}
        locale={{
          emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Займов нет" />,
        }}
      />
    </Space>
  );
}

function LeaveTab({ employeeId, canManage }: { employeeId: number; canManage: boolean }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<{
    kind: LeaveKind;
    range: [Dayjs, Dayjs];
    is_paid: boolean;
  }>();

  const query = useQuery({
    queryKey: ["leave-periods", employeeId],
    queryFn: () => listEmployeeLeave(employeeId),
  });

  const create = useMutation({
    mutationFn: (body: LeavePeriodCreate) => createEmployeeLeave(employeeId, body),
    onSuccess: () => {
      message.success("Период записан");
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ["leave-periods", employeeId] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (leaveId: number) => deleteEmployeeLeave(employeeId, leaveId),
    onSuccess: () => {
      message.success("Период удалён");
      queryClient.invalidateQueries({ queryKey: ["leave-periods", employeeId] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const columns: ColumnsType<LeavePeriodOut> = [
    {
      title: "Вид",
      dataIndex: "kind",
      width: 130,
      render: (v: LeaveKind) => <LeaveKindTag kind={v} />,
    },
    { title: "С", dataIndex: "start_date", width: 110, render: (v) => fmtDate(v) },
    { title: "По", dataIndex: "end_date", width: 110, render: (v) => fmtDate(v) },
    {
      title: "Оплата",
      dataIndex: "is_paid",
      width: 90,
      render: (v: boolean) => (v ? "Оплачивается" : "Без оплаты"),
    },
    {
      title: "Источник",
      dataIndex: "source",
      width: 110,
      render: (v) => (v === "request" ? "Заявление" : "HR"),
    },
    ...(canManage
      ? [
          {
            title: "",
            width: 50,
            render: (_: unknown, row: LeavePeriodOut) =>
              row.source === "hr" ? (
                <Popconfirm
                  title="Удалить период?"
                  okText="Удалить"
                  cancelText="Отмена"
                  onConfirm={() => remove.mutate(row.leave_period_id)}
                >
                  <Button type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              ) : null,
          } as ColumnsType<LeavePeriodOut>[number],
        ]
      : []),
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {canManage && (
        <Form
          form={form}
          layout="inline"
          onFinish={(v) =>
            create.mutate({
              kind: v.kind,
              start_date: v.range[0].format("YYYY-MM-DD"),
              end_date: v.range[1].format("YYYY-MM-DD"),
              is_paid: v.is_paid,
            })
          }
          initialValues={{ kind: "vacation", is_paid: true }}
        >
          <Form.Item name="kind" rules={[{ required: true, message: "Вид" }]}>
            <Select
              style={{ width: 150 }}
              options={Object.entries(LEAVE_KIND_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          </Form.Item>
          <Form.Item name="range" rules={[{ required: true, message: "Даты" }]}>
            <DatePicker.RangePicker format="DD.MM.YYYY" />
          </Form.Item>
          <Form.Item name="is_paid" valuePropName="checked">
            <Checkbox>Оплачивается</Checkbox>
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={create.isPending} icon={<PlusOutlined />}>
              Записать
            </Button>
          </Form.Item>
        </Form>
      )}
      <Table<LeavePeriodOut>
        rowKey="leave_period_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data}
        columns={columns}
        pagination={false}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Отпусков и больничных нет"
            />
          ),
        }}
      />
    </Space>
  );
}

function MedicalTab({ employeeId, canManage }: { employeeId: number; canManage: boolean }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<{
    title?: string;
    signed_on: Dayjs;
    expires_on: Dayjs;
    note?: string;
  }>();

  const query = useQuery({
    queryKey: ["medical-books", employeeId],
    queryFn: () => listEmployeeMedicalBooks(employeeId, true),
  });

  const create = useMutation({
    mutationFn: (body: MedicalBookCreate) => createMedicalBook(employeeId, body),
    onSuccess: () => {
      message.success("Медкнижка добавлена");
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ["medical-books"] });
      queryClient.invalidateQueries({ queryKey: ["medical-book-alerts"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const deactivate = useMutation({
    mutationFn: (bookId: number) => deactivateMedicalBook(employeeId, bookId),
    onSuccess: () => {
      message.success("Медкнижка снята");
      queryClient.invalidateQueries({ queryKey: ["medical-books"] });
      queryClient.invalidateQueries({ queryKey: ["medical-book-alerts"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {canManage && (
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) =>
            create.mutate({
              title: v.title?.trim() || null,
              signed_on: v.signed_on.format("YYYY-MM-DD"),
              expires_on: v.expires_on.format("YYYY-MM-DD"),
              note: v.note?.trim() || null,
            })
          }
        >
          <Form.Item name="title" label="Название">
            <Input placeholder="Медкнижка" />
          </Form.Item>
          <Space wrap>
            <Form.Item
              name="signed_on"
              label="Дата подписи"
              rules={[{ required: true, message: "Дата подписи" }]}
            >
              <DatePicker format="DD.MM.YYYY" />
            </Form.Item>
            <Form.Item
              name="expires_on"
              label="Действует до"
              rules={[{ required: true, message: "Срок" }]}
            >
              <DatePicker format="DD.MM.YYYY" />
            </Form.Item>
          </Space>
          <Form.Item name="note" label="Комментарий">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={create.isPending} icon={<PlusOutlined />}>
            Добавить медкнижку
          </Button>
        </Form>
      )}
      {(query.data ?? []).length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Медкнижек нет" />
      ) : (
        (query.data ?? []).map((book) => (
          <MedicalBookCard
            key={book.medical_book_id}
            employeeId={employeeId}
            book={book}
            canManage={canManage}
            onDeactivate={() => deactivate.mutate(book.medical_book_id)}
          />
        ))
      )}
    </Space>
  );
}

function MedicalBookCard({
  employeeId,
  book,
  canManage,
  onDeactivate,
}: {
  employeeId: number;
  book: MedicalBookOut;
  canManage: boolean;
  onDeactivate: () => void;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--ant-color-border-secondary, #f0f0f0)",
        borderRadius: 8,
        padding: 12,
        opacity: book.is_active ? 1 : 0.6,
      }}
    >
      <Space style={{ width: "100%", justifyContent: "space-between" }}>
        <Space>
          <Typography.Text strong>{book.title}</Typography.Text>
          <MedicalAlertTag alert={book.alert} daysLeft={book.days_left} />
          {!book.is_active && <Typography.Text type="secondary">снята</Typography.Text>}
        </Space>
        {canManage && book.is_active && (
          <Popconfirm title="Снять медкнижку?" okText="Снять" cancelText="Отмена" onConfirm={onDeactivate}>
            <Button size="small" danger>
              Снять
            </Button>
          </Popconfirm>
        )}
      </Space>
      <Typography.Text type="secondary" style={{ display: "block", margin: "8px 0" }}>
        Подпись {fmtDate(book.signed_on)} · до {fmtDate(book.expires_on)}
        {book.note ? ` · ${book.note}` : ""}
      </Typography.Text>
      <AttachmentsPanel
        owner={{ kind: "medical_book", employeeId, bookId: book.medical_book_id }}
        canManage={canManage && book.is_active}
        emptyText="Скана ещё нет"
        uploadHint="Скан медкнижки — pdf или фото"
      />
    </div>
  );
}

function DisciplineTab({ employeeId, canManage }: { employeeId: number; canManage: boolean }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<{
    kind: DisciplinaryCreate["kind"];
    issued_on: Dayjs;
    reason: string;
    note?: string;
  }>();

  const query = useQuery({
    queryKey: ["disciplinaries", employeeId],
    queryFn: () => listEmployeeDisciplinaries(employeeId),
  });

  const create = useMutation({
    mutationFn: (body: DisciplinaryCreate) => createDisciplinary(employeeId, body),
    onSuccess: () => {
      message.success("Взыскание записано");
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ["disciplinaries"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteDisciplinary(employeeId, id),
    onSuccess: () => {
      message.success("Запись удалена");
      queryClient.invalidateQueries({ queryKey: ["disciplinaries"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const columns: ColumnsType<DisciplinaryOut> = [
    {
      title: "Вид",
      dataIndex: "kind",
      width: 160,
      render: (v: DisciplinaryOut["kind"]) => <DisciplinaryKindTag kind={v} />,
    },
    { title: "Дата", dataIndex: "issued_on", width: 110, render: (v) => fmtDate(v) },
    { title: "Основание", dataIndex: "reason" },
    { title: "Кто внёс", dataIndex: "issued_by_name", width: 140, render: (v) => v || "—" },
    ...(canManage
      ? [
          {
            title: "",
            width: 50,
            render: (_: unknown, row: DisciplinaryOut) => (
              <Popconfirm
                title="Удалить запись?"
                okText="Удалить"
                cancelText="Отмена"
                onConfirm={() => remove.mutate(row.disciplinary_id)}
              >
                <Button type="text" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            ),
          } as ColumnsType<DisciplinaryOut>[number],
        ]
      : []),
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {canManage && (
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) =>
            create.mutate({
              kind: v.kind,
              issued_on: v.issued_on.format("YYYY-MM-DD"),
              reason: v.reason.trim(),
              note: v.note?.trim() || null,
            })
          }
          initialValues={{ kind: "remark" }}
        >
          <Space wrap>
            <Form.Item name="kind" label="Вид" rules={[{ required: true }]}>
              <Select options={DISCIPLINARY_OPTIONS} style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="issued_on" label="Дата" rules={[{ required: true, message: "Дата" }]}>
              <DatePicker format="DD.MM.YYYY" />
            </Form.Item>
          </Space>
          <Form.Item name="reason" label="Основание" rules={[{ required: true, message: "Основание" }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="note" label="Комментарий">
            <Input />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={create.isPending} icon={<PlusOutlined />}>
            Записать взыскание
          </Button>
        </Form>
      )}
      <Table<DisciplinaryOut>
        rowKey="disciplinary_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data}
        columns={columns}
        pagination={false}
        locale={{
          emptyText: (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Взысканий нет" />
          ),
        }}
      />
    </Space>
  );
}

function EmployeeRequests({
  employeeId,
  onOpen,
}: {
  employeeId: number;
  onOpen: (requestId: number) => void;
}) {
  const query = useQuery({
    queryKey: ["employee-requests", employeeId],
    queryFn: () => listRequests({ employee_id: employeeId, limit: 50, offset: 0 }),
  });

  const columns: ColumnsType<RequestOut> = [
    {
      title: "Тип",
      dataIndex: "type",
      width: 150,
      render: (_, row) => <RequestTypeTag type={row.type} />,
    },
    {
      title: "Статус",
      dataIndex: "status",
      width: 190,
      render: (_, row) => <RequestStatusTags req={row} />,
    },
    {
      title: "О чём",
      render: (_, row) => (
        <Typography.Text style={{ fontSize: 14 }}>{describeRequest(row)}</Typography.Text>
      ),
    },
    {
      title: "Подано",
      dataIndex: "created_at",
      width: 130,
      render: (v) => (
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          {fmtDateTime(v)}
        </Typography.Text>
      ),
    },
  ];

  return (
    <Table<RequestOut>
      rowKey="request_id"
      size="small"
      loading={query.isPending}
      dataSource={query.data?.items}
      columns={columns}
      pagination={false}
      rowClassName={() => "row-clickable"}
      onRow={(row) => ({ onClick: () => onOpen(row.request_id) })}
      locale={{
        emptyText: (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Заявлений не подавал" />
        ),
      }}
    />
  );
}
