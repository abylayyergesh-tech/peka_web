/** /customers — customer list + CRUD modal (cap customer.manage). */
import { PlusOutlined } from "@ant-design/icons";
import {
  App, Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  createCustomer, deleteCustomer, listCustomers, listMenus, updateCustomer,
  type BillingMode, type CustomerCreate, type CustomerOut,
} from "@/api/sales";
import { useCan } from "@/auth/store";
import { Money } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import {
  BILLING_MODE, BILLING_MODE_OPTIONS, BillingModeTag,
} from "@/pages/sales/statusTags";

/** Куда переводится клиент по кнопке «Перевести» — категорий ровно две. */
const OTHER_MODE: Record<BillingMode, BillingMode> = {
  weekly: "per_order",
  per_order: "weekly",
};

export default function CustomersPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("customer.manage");
  const { limit, offset, tablePagination, reset } = usePagination();
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("active");
  const active = activeFilter === "all" ? undefined : activeFilter === "active";
  const [modeFilter, setModeFilter] = useState<BillingMode | "all">("all");
  const billing_mode = modeFilter === "all" ? undefined : modeFilter;
  const [editing, setEditing] = useState<CustomerOut | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const query = useQuery({
    queryKey: ["customers", { limit, offset, active, billing_mode }],
    queryFn: () => listCustomers({ limit, offset, active, billing_mode }),
  });

  const menus = useQuery({
    queryKey: ["menus", "active"],
    queryFn: () => listMenus({ active: true }),
    staleTime: 60_000,
  });
  const defaultMenuName =
    menus.data?.find((m) => m.is_default)?.name ?? "Основное меню";
  /** menu_id = null означает базовые цены, то есть основное меню. */
  const menuName = (id: number | null) =>
    id == null
      ? defaultMenuName
      : menus.data?.find((m) => m.menu_id === id)?.name ?? `#${id}`;

  const save = useMutation({
    mutationFn: (values: CustomerCreate) =>
      editing ? updateCustomer(editing.customer_id, values) : createCustomer(values),
    onSuccess: () => {
      message.success(editing ? "Сохранено" : "Клиент создан");
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteCustomer(id),
    onSuccess: () => {
      message.success("Клиент деактивирован");
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  /** Перевод между категориями расчётов. Прайс-лист не трогаем: разделение он
   *  задал однократно при переходе, дальше это независимые атрибуты. */
  const moveMode = useMutation({
    mutationFn: (v: { id: number; mode: BillingMode }) =>
      updateCustomer(v.id, { billing_mode: v.mode }),
    onSuccess: (c) => {
      message.success(`«${c.name}» → ${BILLING_MODE[c.billing_mode].label.toLowerCase()}`);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer", c.customer_id] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openCreate() {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  }

  function openEdit(row: CustomerOut) {
    setEditing(row);
    form.setFieldsValue({
      ...row,
      credit_limit: row.credit_limit != null ? Number(row.credit_limit) : undefined,
    });
    setModalOpen(true);
  }

  const columns: ColumnsType<CustomerOut> = [
    {
      title: "Название",
      dataIndex: "name",
      render: (v: string, row) => <Link to={`/customers/${row.customer_id}`}>{v}</Link>,
    },
    { title: "Телефон", dataIndex: "phone", render: (v: string | null) => v ?? "—" },
    { title: "Email", dataIndex: "email", render: (v: string | null) => v ?? "—" },
    {
      title: "БИН/ИИН",
      dataIndex: "tax_id",
      width: 150,
      render: (v: string | null) =>
        v ?? <span style={{ color: "#999" }}>самост. точка</span>,
    },
    {
      title: "Прайс-лист",
      dataIndex: "menu_id",
      width: 170,
      render: (v: number | null) =>
        v == null ? (
          <span style={{ color: "#999" }}>{defaultMenuName}</span>
        ) : (
          <Tag color="blue">{menuName(v)}</Tag>
        ),
    },
    {
      title: "Расчёты",
      dataIndex: "billing_mode",
      width: 150,
      render: (v: BillingMode) => (
        <Tooltip title={BILLING_MODE[v]?.hint}>
          <span>
            <BillingModeTag mode={v} />
          </span>
        </Tooltip>
      ),
    },
    {
      title: "Кредитный лимит",
      dataIndex: "credit_limit",
      align: "right",
      render: (v: string | null) => <Money value={v} />,
    },
    {
      title: "Статус",
      dataIndex: "is_active",
      width: 110,
      render: (v: boolean) => (v ? <Tag color="green">Активен</Tag> : <Tag>Неактивен</Tag>),
    },
    {
      title: "",
      width: 300,
      render: (_, row) => (
        <Space>
          <Link to={`/customers/${row.customer_id}`}>Карточка</Link>
          {canManage && (
            <>
              <a onClick={() => openEdit(row)}>Изменить</a>
              <Popconfirm
                title="Перевести в другую категорию?"
                description={
                  <span style={{ display: "block", maxWidth: 320 }}>
                    {BILLING_MODE[OTHER_MODE[row.billing_mode]].hint}
                    <br />
                    Прайс-лист клиента не меняется.
                  </span>
                }
                okText="Перевести"
                cancelText="Отмена"
                onConfirm={() =>
                  moveMode.mutate({
                    id: row.customer_id,
                    mode: OTHER_MODE[row.billing_mode],
                  })
                }
              >
                <a>→ {BILLING_MODE[OTHER_MODE[row.billing_mode]].label.toLowerCase()}</a>
              </Popconfirm>
              {row.is_active && (
                <Popconfirm
                  title="Деактивировать клиента?"
                  okText="Да"
                  cancelText="Нет"
                  onConfirm={() => remove.mutate(row.customer_id)}
                >
                  <a>Деактивировать</a>
                </Popconfirm>
              )}
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <Space>
          <h2 style={{ margin: 0 }}>Клиенты</h2>
          <Select
            style={{ width: 150 }}
            value={activeFilter}
            onChange={(v) => {
              setActiveFilter(v);
              reset();
            }}
            options={[
              { value: "all", label: "Все" },
              { value: "active", label: "Активные" },
              { value: "inactive", label: "Неактивные" },
            ]}
          />
          <Select
            style={{ width: 210 }}
            value={modeFilter}
            onChange={(v) => {
              setModeFilter(v);
              reset();
            }}
            options={[
              { value: "all", label: "Расчёты: любые" },
              ...BILLING_MODE_OPTIONS.map((o) => ({
                value: o.value,
                label: `Расчёты: ${o.label.toLowerCase()}`,
              })),
            ]}
          />
        </Space>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Добавить
          </Button>
        )}
      </Space>
      <Table
        rowKey="customer_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        pagination={tablePagination(query.data?.total)}
        columns={columns}
      />
      <Modal
        title={editing ? "Изменить клиента" : "Новый клиент"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={save.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Form.Item
            name="name"
            label="Название"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Input maxLength={256} />
          </Form.Item>
          <Form.Item
            name="tax_id"
            label="БИН/ИИН"
            tooltip="Один БИН — один клиент: все кофейни этого юрлица заводятся точками
                     в его карточке. Пусто — точка самостоятельная."
          >
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item name="phone" label="Телефон">
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: "email", message: "Некорректный email" }]}>
            <Input maxLength={256} />
          </Form.Item>
          <Form.Item
            name="menu_id"
            label="Прайс-лист"
            tooltip="Не выбран — клиент платит по базовым ценам основного меню"
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={defaultMenuName}
              loading={menus.isPending}
              options={menus.data
                ?.filter((m) => !m.is_default)
                .map((m) => ({ value: m.menu_id, label: m.name }))}
            />
          </Form.Item>
          <Form.Item
            name="billing_mode"
            label="Расчёты"
            initialValue="per_order"
            tooltip="Раз в неделю — сводный счёт переводом (договорные кофейни).
                     По заказу — счёт на каждый заказ в клиентском портале."
          >
            <Select options={BILLING_MODE_OPTIONS} />
          </Form.Item>
          <Form.Item name="credit_limit" label="Кредитный лимит">
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="note" label="Примечание">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
