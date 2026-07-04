/** /customers/:id — customer card: info + tabs "Платежи" (register/void)
 * and "Взаиморасчёты" (cursor-paged receivable ledger). */
import { ArrowLeftOutlined, PlusOutlined } from "@ant-design/icons";
import {
  App, Button, Card, DatePicker, Descriptions, Form, Input, InputNumber, Modal,
  Popconfirm, Result, Select, Space, Spin, Table, Tabs, Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  customerLedger, getCustomer, listCustomerPayments, recordCustomerPayment,
  voidCustomerPayment,
  type CustomerPaymentOut, type ReceivableEntryOut,
} from "@/api/sales";
import { useCan } from "@/auth/store";
import { Money, fmtDate } from "@/components/format";
import { PaymentStatusTag } from "@/pages/sales/statusTags";

const LEDGER_SOURCE_LABELS: Record<string, string> = {
  check: "Чек",
  payment: "Платёж",
  payment_void: "Отмена платежа",
};

const PAYMENT_METHOD_OPTIONS = [
  { value: "cash", label: "Наличные" },
  { value: "card", label: "Карта" },
  { value: "transfer", label: "Перевод" },
];

interface PaymentFormValues {
  payment_date: Dayjs;
  amount: number;
  method?: string;
  note?: string;
}

export default function CustomerDetailPage() {
  const { id } = useParams();
  const customerId = Number(id);
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const canPay = useCan("customer_payment.manage");
  const canReport = useCan("report.read");
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payForm] = Form.useForm();

  const customer = useQuery({
    queryKey: ["customer", customerId],
    queryFn: () => getCustomer(customerId),
    enabled: Number.isFinite(customerId),
  });

  const payments = useQuery({
    queryKey: ["customer-payments", customerId],
    queryFn: () => listCustomerPayments(customerId),
    enabled: Number.isFinite(customerId),
  });

  const ledger = useInfiniteQuery({
    queryKey: ["customer-ledger", customerId],
    queryFn: ({ pageParam }) => customerLedger(customerId, { after_seq: pageParam, limit: 50 }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_after_seq ?? undefined,
    enabled: Number.isFinite(customerId) && canReport,
  });

  const registerPayment = useMutation({
    mutationFn: (v: PaymentFormValues) =>
      recordCustomerPayment(customerId, {
        payment_date: v.payment_date.format("YYYY-MM-DD"),
        amount: v.amount,
        method: v.method ?? null,
        note: v.note ?? null,
      }),
    onSuccess: () => {
      message.success("Платёж зарегистрирован");
      setPayModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["customer-payments", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customer-ledger", customerId] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const voidPayment = useMutation({
    mutationFn: (paymentId: number) => voidCustomerPayment(customerId, paymentId),
    onSuccess: () => {
      message.success("Платёж аннулирован");
      queryClient.invalidateQueries({ queryKey: ["customer-payments", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customer-ledger", customerId] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  if (customer.isPending) return <Spin style={{ display: "block", margin: "48px auto" }} />;
  if (customer.isError) {
    return (
      <Result status="error" title="Клиент не найден" subTitle={errorMessage(customer.error)} />
    );
  }

  const c = customer.data;

  const paymentColumns: ColumnsType<CustomerPaymentOut> = [
    { title: "Дата", dataIndex: "payment_date", width: 120, render: (v: string) => fmtDate(v) },
    {
      title: "Сумма",
      dataIndex: "amount",
      align: "right",
      render: (v: string) => <Money value={v} />,
    },
    {
      title: "Способ",
      dataIndex: "method",
      render: (v: string | null) =>
        PAYMENT_METHOD_OPTIONS.find((o) => o.value === v)?.label ?? v ?? "—",
    },
    { title: "Примечание", dataIndex: "note", render: (v: string | null) => v ?? "—" },
    {
      title: "Статус",
      dataIndex: "status",
      width: 130,
      render: (v: string) => <PaymentStatusTag status={v} />,
    },
    {
      title: "",
      width: 130,
      render: (_, row) =>
        canPay &&
        row.status === "active" && (
          <Popconfirm
            title="Аннулировать платёж?"
            okText="Аннулировать"
            cancelText="Отмена"
            onConfirm={() => voidPayment.mutate(row.id)}
          >
            <a>Аннулировать</a>
          </Popconfirm>
        ),
    },
  ];

  const ledgerEntries = ledger.data?.pages.flatMap((p) => p.items) ?? [];
  const ledgerColumns: ColumnsType<ReceivableEntryOut> = [
    { title: "Дата", dataIndex: "entry_date", width: 120, render: (v: string) => fmtDate(v) },
    {
      title: "Операция",
      dataIndex: "source_type",
      render: (v: string, row) => `${LEDGER_SOURCE_LABELS[v] ?? v} №${row.source_id}`,
    },
    {
      title: "Изменение долга",
      dataIndex: "amount_delta",
      align: "right",
      render: (v: string) => (
        <span style={{ color: Number(v) > 0 ? "#cf1322" : "#3f8600" }}>
          <Money value={v} />
        </span>
      ),
    },
    {
      title: "Долг после",
      dataIndex: "balance_after",
      align: "right",
      render: (v: string) => <Money value={v} />,
    },
  ];

  const tabItems = [
    {
      key: "payments",
      label: "Платежи",
      children: (
        <div>
          {canPay && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              style={{ marginBottom: 12 }}
              onClick={() => {
                payForm.resetFields();
                setPayModalOpen(true);
              }}
            >
              Зарегистрировать платёж
            </Button>
          )}
          <Table
            rowKey="id"
            size="small"
            loading={payments.isPending}
            dataSource={payments.data}
            pagination={false}
            columns={paymentColumns}
          />
        </div>
      ),
    },
    ...(canReport
      ? [
          {
            key: "ledger",
            label: "Взаиморасчёты",
            children: (
              <div>
                <Table
                  rowKey="id"
                  size="small"
                  loading={ledger.isPending}
                  dataSource={ledgerEntries}
                  pagination={false}
                  columns={ledgerColumns}
                />
                {ledger.hasNextPage && (
                  <Button
                    style={{ marginTop: 12 }}
                    loading={ledger.isFetchingNextPage}
                    onClick={() => ledger.fetchNextPage()}
                  >
                    Показать ещё
                  </Button>
                )}
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/customers")}>
          К клиентам
        </Button>
        <h2 style={{ margin: 0 }}>
          {c.name}{" "}
          {c.is_active ? <Tag color="green">Активен</Tag> : <Tag>Неактивен</Tag>}
        </h2>
      </Space>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Descriptions size="small" column={3}>
          <Descriptions.Item label="Телефон">{c.phone ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="Email">{c.email ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="ИНН">{c.tax_id ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="Кредитный лимит">
            <Money value={c.credit_limit} />
          </Descriptions.Item>
          <Descriptions.Item label="Создан">{fmtDate(c.created_at)}</Descriptions.Item>
          <Descriptions.Item label="Примечание">{c.note ?? "—"}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Tabs items={tabItems} />

      <Modal
        title="Зарегистрировать платёж"
        open={payModalOpen}
        onCancel={() => setPayModalOpen(false)}
        onOk={() => payForm.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={registerPayment.isPending}
        destroyOnClose
      >
        <Form
          form={payForm}
          layout="vertical"
          onFinish={(v: PaymentFormValues) => registerPayment.mutate(v)}
        >
          <Form.Item
            name="payment_date"
            label="Дата платежа"
            initialValue={dayjs()}
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <DatePicker style={{ width: "100%" }} format="DD.MM.YYYY" />
          </Form.Item>
          <Form.Item
            name="amount"
            label="Сумма"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <InputNumber min={0.01} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="method" label="Способ">
            <Select allowClear options={PAYMENT_METHOD_OPTIONS} />
          </Form.Item>
          <Form.Item name="note" label="Примечание">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
