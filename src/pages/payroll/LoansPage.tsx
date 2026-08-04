/** Фин. займы — лист «Займы» рабочего шаблона: сумма, срок и график удержаний
 * по месяцам. Платёж месяца текущего табеля автоматически вычитается из
 * зарплаты. «Контроль» ≠ 0 значит график не сходится с суммой займа. */
import { PlusOutlined } from "@ant-design/icons";
import {
  App,
  Alert,
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchAllPages, errorMessage } from "@/api/client";
import {
  createLoan,
  listLoans,
  updateLoan,
  type LoanOut,
  type LoanStatus,
} from "@/api/payroll";
import { listEmployees } from "@/api/staff";
import { useCan } from "@/auth/store";
import { fmtDate } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import { MONTH_NAMES, fmtTenge } from "@/pages/payroll/shared";

interface FormValues {
  employee_id: number;
  principal_amount: number;
  term_months: number;
  monthly_amount?: number;
  issued_on?: dayjs.Dayjs;
  note?: string;
}

export default function LoansPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("payroll.manage");
  const { limit, offset, tablePagination, reset } = usePagination(20);
  const [status, setStatus] = useState<LoanStatus | undefined>("active");
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm<FormValues>();

  const query = useQuery({
    queryKey: ["payroll-loans", { limit, offset, status }],
    queryFn: () => listLoans({ limit, offset, status }),
  });

  const employees = useQuery({
    queryKey: ["employees-all"],
    queryFn: () =>
      fetchAllPages((p) => listEmployees({ ...p, status: "active" })),
    staleTime: 60_000,
    enabled: createOpen,
  });

  const create = useMutation({
    mutationFn: (values: FormValues) =>
      createLoan({
        employee_id: values.employee_id,
        principal_amount: String(values.principal_amount),
        term_months: values.term_months,
        // Пусто -> бэкенд достроит график: N−1 равных платежей, последний
        // добивает остаток (как «Контроль = 0» в шаблоне).
        monthly_amount:
          values.monthly_amount != null ? String(values.monthly_amount) : null,
        issued_on: values.issued_on ? values.issued_on.format("YYYY-MM-DD") : null,
        note: values.note || null,
      }),
    onSuccess: () => {
      message.success("Займ создан, график удержаний построен");
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ["payroll-loans"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const close = useMutation({
    mutationFn: (id: number) => updateLoan(id, { status: "closed" }),
    onSuccess: () => {
      message.success("Займ закрыт");
      queryClient.invalidateQueries({ queryKey: ["payroll-loans"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const columns: ColumnsType<LoanOut> = [
    { title: "ФИО", dataIndex: "employee_name", width: 240, render: (v) => v || "—" },
    { title: "Должность", dataIndex: "position", width: 180, render: (v) => v || "—" },
    {
      title: "Сумма займа",
      dataIndex: "principal_amount",
      width: 130,
      align: "right",
      render: (v: string) => fmtTenge(v),
    },
    {
      title: "Срок",
      dataIndex: "term_months",
      width: 90,
      render: (v: number | null) => (v ? `${v} мес` : "—"),
    },
    {
      title: "Ежемесячно",
      dataIndex: "monthly_amount",
      width: 120,
      align: "right",
      render: (v: string | null) => fmtTenge(v),
    },
    {
      title: "Итого по графику",
      dataIndex: "scheduled_total",
      width: 140,
      align: "right",
      render: (v: string) => fmtTenge(v),
    },
    {
      title: "Контроль",
      dataIndex: "control",
      width: 120,
      align: "right",
      render: (v: string) =>
        Number(v) === 0 ? (
          <Tag color="green">сходится</Tag>
        ) : (
          <Tooltip title="Сумма займа минус график: график не сходится">
            <Tag color="red">{fmtTenge(v)}</Tag>
          </Tooltip>
        ),
    },
    {
      title: "Удержано",
      dataIndex: "deducted_total",
      width: 120,
      align: "right",
      render: (v: string) => fmtTenge(v),
    },
    { title: "Выдан", dataIndex: "issued_on", width: 110, render: fmtDate },
    {
      title: "Статус",
      dataIndex: "status",
      width: 100,
      render: (v: LoanStatus) =>
        v === "active" ? <Tag color="blue">Активен</Tag> : <Tag>Закрыт</Tag>,
    },
    {
      title: "Источник",
      dataIndex: "request_id",
      width: 130,
      render: (v: number | null, row) =>
        v != null ? <Tag>Заявка #{v}</Tag> : row.note ? <Tooltip title={row.note}>—</Tooltip> : "—",
    },
    ...(canManage
      ? ([
          {
            title: "",
            key: "actions",
            width: 90,
            render: (_: unknown, row: LoanOut) =>
              row.status === "active" ? (
                <a onClick={() => close.mutate(row.employee_loan_id)}>Закрыть</a>
              ) : null,
          },
        ] as ColumnsType<LoanOut>)
      : []),
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <h2 style={{ margin: 0 }}>Фин. займы</h2>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            Выдать займ
          </Button>
        )}
      </Space>

      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          allowClear
          placeholder="Статус"
          style={{ width: 150 }}
          value={status}
          onChange={(v) => {
            setStatus(v);
            reset();
          }}
          options={[
            { value: "active", label: "Активные" },
            { value: "closed", label: "Закрытые" },
          ]}
        />
      </Space>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Платёж месяца, за который считается зарплатная ведомость, вычитается автоматически. По расчётам через ИП займы из зарплаты не вычитаются."
      />

      <Table
        rowKey="employee_loan_id"
        size="small"
        loading={query.isLoading}
        dataSource={query.data?.items ?? []}
        columns={columns}
        scroll={{ x: 1700 }}
        pagination={tablePagination(query.data?.total)}
        expandable={{
          expandedRowRender: (row) => (
            <Space wrap size={[8, 8]}>
              {row.schedule.length === 0 && (
                <Typography.Text type="secondary">График пуст</Typography.Text>
              )}
              {row.schedule.map((s) => (
                <Tag
                  key={s.employee_loan_schedule_id}
                  color={s.deducted_payroll_run_id != null ? "green" : "default"}
                >
                  {MONTH_NAMES[s.period_month - 1]} {s.period_year}: {fmtTenge(s.amount)}
                  {s.deducted_payroll_run_id != null ? " ✓" : ""}
                </Tag>
              ))}
            </Space>
          ),
          rowExpandable: () => true,
        }}
      />

      <Modal
        open={createOpen}
        title="Выдать займ"
        okText="Выдать"
        cancelText="Отмена"
        confirmLoading={create.isPending}
        onCancel={() => setCreateOpen(false)}
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => create.mutate(v)}>
          <Form.Item name="employee_id" label="Сотрудник" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              loading={employees.isLoading}
              options={(employees.data ?? []).map((e) => ({
                value: e.employee_id,
                label: e.full_name,
              }))}
            />
          </Form.Item>
          <Form.Item name="principal_amount" label="Сумма займа, ₸" rules={[{ required: true }]}>
            <InputNumber min={1} step={10000} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="term_months" label="Срок, месяцев" rules={[{ required: true }]}>
            <InputNumber min={1} max={120} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="monthly_amount"
            label="Ежемесячный платёж, ₸"
            extra="Оставьте пустым — график построится равными платежами, последний добьёт остаток"
          >
            <InputNumber min={1} step={10000} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="issued_on" label="Дата выдачи" extra="Удержания начнутся со следующего месяца">
            <DatePicker format="DD.MM.YYYY" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="note" label="Примечание">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
