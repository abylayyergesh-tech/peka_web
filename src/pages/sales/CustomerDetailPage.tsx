/** /customers/:id — customer card: info + tabs "Платежи" (register/void)
 * and "Взаиморасчёты" (cursor-paged receivable ledger). */
import { ArrowLeftOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
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
  customerLedger, getCustomer,   listCustomerPayments, listMenus, recordCustomerPayment,
  updateCustomer, voidCustomerPayment,
  type BillingMode, type CustomerPaymentOut, type ReceivableEntryOut,
} from "@/api/sales";
import { useCustomerCategories } from "@/pages/sales/CustomerCategoriesModal";
import { useCan } from "@/auth/store";
import {
  EntityTag,
  useCompanyEntities,
} from "@/pages/finance/companyEntities";
import { Money, fmtDate } from "@/components/format";
import CustomerOutletsTab from "@/pages/sales/CustomerOutletsTab";
import {
  BILLING_MODE, BILLING_MODE_OPTIONS, BillingModeTag, PaymentStatusTag,
} from "@/pages/sales/statusTags";

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
  /** На какое наше юр. лицо пришли деньги. Пусто — юрлицо самого клиента. */
  company_entity_id?: number;
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
  const canManageCustomer = useCan("customer.manage");
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [payForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const entities = useCompanyEntities(true);

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

  const menus = useQuery({
    queryKey: ["menus", "active"],
    queryFn: () => listMenus({ active: true }),
    staleTime: 60_000,
  });
  const categories = useCustomerCategories();
  const defaultMenuName = menus.data?.find((m) => m.is_default)?.name ?? "Основное меню";

  /** Прайс-лист меняется прямо из карточки — это самая частая правка клиента. */
  const setMenu = useMutation({
    mutationFn: (menuId: number | null) => updateCustomer(customerId, { menu_id: menuId }),
    onSuccess: () => {
      message.success("Прайс-лист клиента обновлён");
      queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const setCategory = useMutation({
    mutationFn: (categoryId: number | null) =>
      updateCustomer(customerId, { customer_category_id: categoryId }),
    onSuccess: () => {
      message.success("Категория клиента обновлена");
      queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer-categories"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  /** Категория расчётов — отдельная мутация: прайс-лист при переводе не трогаем. */
  const setBillingMode = useMutation({
    mutationFn: (mode: BillingMode) => updateCustomer(customerId, { billing_mode: mode }),
    onSuccess: (updated) => {
      message.success(`Расчёты: ${BILLING_MODE[updated.billing_mode].label.toLowerCase()}`);
      queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const saveProfile = useMutation({
    mutationFn: (v: {
      name: string;
      legal_name?: string;
      tax_id?: string;
      bank_account?: string;
      phone?: string;
      email?: string;
      credit_limit?: number;
      note?: string;
    }) =>
      updateCustomer(customerId, {
        name: v.name,
        legal_name: v.legal_name || null,
        tax_id: v.tax_id || null,
        bank_account: v.bank_account || null,
        phone: v.phone || null,
        email: v.email || null,
        credit_limit: v.credit_limit ?? null,
        note: v.note || null,
      }),
    onSuccess: () => {
      message.success("Сохранено");
      setEditOpen(false);
      queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e) => message.error(errorMessage(e)),
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
        company_entity_id: v.company_entity_id,
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
      title: "Юр. лицо",
      dataIndex: "company_entity_id",
      width: 180,
      render: (id: number | null) => <EntityTag entities={entities.data} id={id} />,
    },
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
            onConfirm={() => voidPayment.mutate(row.customer_payment_id)}
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
      // Первой: у сети кофеен один клиент и много адресов — это главное, что о
      // клиенте нужно знать, чтобы принять заказ.
      key: "outlets",
      label: "Точки (адреса)",
      children: <CustomerOutletsTab customerId={customerId} />,
    },
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
            rowKey="customer_payment_id"
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
                  rowKey="receivable_entry_id"
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
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/customers")}>
            К клиентам
          </Button>
          <h2 style={{ margin: 0 }}>
            {c.name}{" "}
            {c.is_active ? <Tag color="green">Активен</Tag> : <Tag>Неактивен</Tag>}
          </h2>
        </Space>
        {canManageCustomer && (
          <Button
            type="primary"
            icon={<EditOutlined />}
            onClick={() => {
              editForm.setFieldsValue({
                name: c.name,
                legal_name: c.legal_name ?? undefined,
                tax_id: c.tax_id ?? undefined,
                bank_account: c.bank_account ?? undefined,
                phone: c.phone ?? undefined,
                email: c.email ?? undefined,
                credit_limit: c.credit_limit != null ? Number(c.credit_limit) : undefined,
                note: c.note ?? undefined,
              });
              setEditOpen(true);
            }}
          >
            Редактировать
          </Button>
        )}
      </Space>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Descriptions size="small" column={3}>
          <Descriptions.Item label="Телефон">{c.phone ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="Email">{c.email ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="БИН/ИИН">
            {c.tax_id ? (
              <Space size={6}>
                {c.tax_id}
                <Tag color="geekblue">юрлицо</Tag>
              </Space>
            ) : (
              <Space size={6}>
                —
                {/* Без БИН точка самостоятельна: у неё не может быть «сестёр». */}
                <Tag>самостоятельная точка</Tag>
              </Space>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Кредитный лимит">
            <Money value={c.credit_limit} />
          </Descriptions.Item>
          <Descriptions.Item label="Категория">
            {canManageCustomer ? (
              <Select
                size="small"
                allowClear
                showSearch
                optionFilterProp="label"
                style={{ minWidth: 200 }}
                placeholder="Без категории"
                loading={categories.isPending || setCategory.isPending}
                value={c.customer_category_id ?? undefined}
                onChange={(v) => setCategory.mutate(v ?? null)}
                options={(categories.data ?? [])
                  .filter(
                    (cat) =>
                      cat.is_active ||
                      cat.customer_category_id === c.customer_category_id,
                  )
                  .map((cat) => ({
                    value: cat.customer_category_id,
                    label: cat.is_active ? cat.name : `${cat.name} (откл.)`,
                  }))}
              />
            ) : (
              categories.data?.find(
                (cat) => cat.customer_category_id === c.customer_category_id,
              )?.name ?? (c.customer_category_id == null ? "—" : `#${c.customer_category_id}`)
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Прайс-лист">
            {canManageCustomer ? (
              <Select
                size="small"
                allowClear
                showSearch
                optionFilterProp="label"
                style={{ minWidth: 200 }}
                placeholder={defaultMenuName}
                loading={menus.isPending || setMenu.isPending}
                value={c.menu_id ?? undefined}
                onChange={(v) => setMenu.mutate(v ?? null)}
                options={menus.data
                  ?.filter((m) => !m.is_default)
                  .map((m) => ({ value: m.menu_id, label: m.name }))}
              />
            ) : c.menu_id == null ? (
              defaultMenuName
            ) : (
              menus.data?.find((m) => m.menu_id === c.menu_id)?.name ?? `#${c.menu_id}`
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Расчёты">
            {canManageCustomer ? (
              <Space size={6}>
                <Select
                  size="small"
                  style={{ minWidth: 160 }}
                  loading={setBillingMode.isPending}
                  value={c.billing_mode}
                  onChange={(v) => setBillingMode.mutate(v)}
                  options={BILLING_MODE_OPTIONS}
                />
                <span style={{ color: "#999" }}>{BILLING_MODE[c.billing_mode]?.hint}</span>
              </Space>
            ) : (
              <Space size={6}>
                <BillingModeTag mode={c.billing_mode} />
                <span style={{ color: "#999" }}>{BILLING_MODE[c.billing_mode]?.hint}</span>
              </Space>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Создан">{fmtDate(c.created_at)}</Descriptions.Item>
          <Descriptions.Item label="Примечание">{c.note ?? "—"}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Tabs items={tabItems} />

      <Modal
        title="Редактировать клиента"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={() => editForm.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={saveProfile.isPending}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" onFinish={(v) => saveProfile.mutate(v)}>
          <Form.Item
            name="name"
            label="Название"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Input maxLength={256} />
          </Form.Item>
          <Form.Item name="legal_name" label="Юридическое название">
            <Input maxLength={256} />
          </Form.Item>
          <Form.Item name="tax_id" label="БИН/ИИН">
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item name="bank_account" label="Расчётный счёт">
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item name="phone" label="Телефон">
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: "email", message: "Некорректный email" }]}>
            <Input maxLength={256} />
          </Form.Item>
          <Form.Item name="credit_limit" label="Кредитный лимит">
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="note" label="Примечание">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

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
          {/* Деньги приходят на счёт конкретного нашего юрлица, и его дебиторка
              уменьшается. Пусто — то юрлицо, к которому отнесён клиент: долг
              гасится там же, где возник. */}
          <Form.Item
            name="company_entity_id"
            label="На наше юр. лицо"
            tooltip="Уменьшится дебиторка этого юр. лица. Пусто — юр. лицо клиента"
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Юр. лицо клиента"
              loading={entities.isPending}
              options={(entities.data ?? [])
                .filter((e) => e.is_active)
                .map((e) => ({ value: e.company_entity_id, label: e.name }))}
            />
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
