/** Реестр выплат: фактические переводы сотрудникам. Пишется автоматически при
 * проведении ведомости и при финальном подтверждении заявления (аванс, займ,
 * отпускные); руками добавляется разовая выплата. */
import { PlusOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchAllPages, errorMessage } from "@/api/client";
import {
  createPayment,
  listPayments,
  type PaymentKind,
  type PaymentOut,
  type PayoutMethod,
} from "@/api/payroll";
import { listEmployees } from "@/api/staff";
import { useCan } from "@/auth/store";
import { fmtDate } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import {
  PAYMENT_KIND_LABELS,
  PAYMENT_KIND_OPTIONS,
  PAYOUT_METHOD_LABELS,
  PayoutMethodTag,
  fmtTenge,
} from "@/pages/payroll/shared";

interface FormValues {
  employee_id: number;
  kind: PaymentKind;
  amount: number;
  method: PayoutMethod;
  paid_on: dayjs.Dayjs;
  note?: string;
}

export default function PaymentsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("payroll.manage");
  const { limit, offset, tablePagination, reset } = usePagination(50);
  const [kind, setKind] = useState<PaymentKind | undefined>();
  const [method, setMethod] = useState<PayoutMethod | undefined>();
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm<FormValues>();

  const query = useQuery({
    queryKey: ["payroll-payments", { limit, offset, kind, method, range }],
    queryFn: () =>
      listPayments({
        limit,
        offset,
        kind,
        method,
        from: range?.[0]?.format("YYYY-MM-DD"),
        to: range?.[1]?.format("YYYY-MM-DD"),
      }),
  });

  const employees = useQuery({
    queryKey: ["employees-all"],
    queryFn: () => fetchAllPages((p) => listEmployees({ ...p, status: "active" })),
    staleTime: 60_000,
    enabled: createOpen,
  });

  const create = useMutation({
    mutationFn: (values: FormValues) =>
      createPayment({
        employee_id: values.employee_id,
        kind: values.kind,
        amount: String(values.amount),
        method: values.method,
        paid_on: values.paid_on ? values.paid_on.format("YYYY-MM-DD") : null,
        note: values.note || null,
      }),
    onSuccess: () => {
      message.success("Выплата зарегистрирована");
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ["payroll-payments"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const rows = query.data?.items ?? [];
  // Итоги считаются по загруженной странице — реестр смотрят с фильтром по месяцу.
  const pageTotal = rows.reduce((acc, r) => acc + Number(r.amount), 0);
  const cardTotal = rows
    .filter((r) => r.method === "card")
    .reduce((acc, r) => acc + Number(r.amount), 0);
  const cashTotal = rows
    .filter((r) => r.method === "cash")
    .reduce((acc, r) => acc + Number(r.amount), 0);

  const columns: ColumnsType<PaymentOut> = [
    { title: "Дата", dataIndex: "paid_on", width: 110, render: fmtDate },
    { title: "ФИО", dataIndex: "employee_name", width: 240, render: (v) => v || "—" },
    {
      title: "Вид",
      dataIndex: "kind",
      width: 130,
      render: (v: PaymentKind) => <Tag>{PAYMENT_KIND_LABELS[v]}</Tag>,
    },
    {
      title: "Сумма",
      dataIndex: "amount",
      width: 130,
      align: "right",
      render: (v: string) => <b>{fmtTenge(v)}</b>,
    },
    {
      title: "Способ",
      dataIndex: "method",
      width: 120,
      render: (v: PayoutMethod) => <PayoutMethodTag method={v} />,
    },
    { title: "Юрлицо", dataIndex: "legal_entity_name", width: 150, render: (v) => v || "—" },
    {
      title: "Источник",
      key: "source",
      width: 170,
      render: (_, row) =>
        row.payroll_run_id != null ? (
          <Link to={`/payroll/runs/${row.payroll_run_id}`}>Ведомость #{row.payroll_run_id}</Link>
        ) : row.request_id != null ? (
          <Tag>Заявление #{row.request_id}</Tag>
        ) : (
          <Tag color="default">Вручную</Tag>
        ),
    },
    { title: "Примечание", dataIndex: "note", render: (v: string | null) => v || "—" },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <h2 style={{ margin: 0 }}>Реестр выплат</h2>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => {
            form.setFieldsValue({ paid_on: dayjs(), kind: "other", method: "cash" });
            setCreateOpen(true);
          }}>
            Разовая выплата
          </Button>
        )}
      </Space>

      <Space wrap style={{ marginBottom: 16 }}>
        <DatePicker.RangePicker
          format="DD.MM.YYYY"
          value={range}
          onChange={(v) => {
            setRange(v as [dayjs.Dayjs, dayjs.Dayjs] | null);
            reset();
          }}
        />
        <Select
          allowClear
          placeholder="Вид"
          style={{ width: 160 }}
          value={kind}
          onChange={(v) => {
            setKind(v);
            reset();
          }}
          options={PAYMENT_KIND_OPTIONS}
        />
        <Select
          allowClear
          placeholder="Способ"
          style={{ width: 150 }}
          value={method}
          onChange={(v) => {
            setMethod(v);
            reset();
          }}
          options={(Object.keys(PAYOUT_METHOD_LABELS) as PayoutMethod[]).map((m) => ({
            value: m,
            label: PAYOUT_METHOD_LABELS[m],
          }))}
        />
      </Space>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col>
          <Card size="small">
            <Statistic title="Всего на странице" value={fmtTenge(pageTotal)} />
          </Card>
        </Col>
        <Col>
          <Card size="small">
            <Statistic title="На карту" value={fmtTenge(cardTotal)} />
          </Card>
        </Col>
        <Col>
          <Card size="small">
            <Statistic title="Наличными" value={fmtTenge(cashTotal)} />
          </Card>
        </Col>
      </Row>

      <Table
        rowKey="payroll_payment_id"
        size="small"
        loading={query.isLoading}
        dataSource={rows}
        columns={columns}
        scroll={{ x: 1300 }}
        pagination={tablePagination(query.data?.total)}
      />

      <Modal
        open={createOpen}
        title="Разовая выплата"
        okText="Зарегистрировать"
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
          <Form.Item name="kind" label="Вид" rules={[{ required: true }]}>
            <Select options={PAYMENT_KIND_OPTIONS} />
          </Form.Item>
          <Form.Item name="amount" label="Сумма, ₸" rules={[{ required: true }]}>
            <InputNumber min={1} step={1000} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="method" label="Способ" rules={[{ required: true }]}>
            <Select
              options={(Object.keys(PAYOUT_METHOD_LABELS) as PayoutMethod[]).map((m) => ({
                value: m,
                label: PAYOUT_METHOD_LABELS[m],
              }))}
            />
          </Form.Item>
          <Form.Item name="paid_on" label="Дата" rules={[{ required: true }]}>
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
