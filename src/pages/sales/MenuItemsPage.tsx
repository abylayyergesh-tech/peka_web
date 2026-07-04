/** /menu-items — menu positions: list + CRUD modal (cap menu.manage). */
import { PlusOutlined } from "@ant-design/icons";
import { App, Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  createMenuItem,
  deleteMenuItem,
  listMenuItems,
  listProductsLookup,
  listUnitsLookup,
  updateMenuItem,
  type MenuItemCreate,
  type MenuItemOut,
} from "@/api/sales";
import { useCan } from "@/auth/store";
import { Money, fmtQty } from "@/components/format";
import { usePagination } from "@/components/usePagination";

export default function MenuItemsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("menu.manage");
  const { limit, offset, tablePagination, reset } = usePagination();
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("active");
  const active = activeFilter === "all" ? undefined : activeFilter === "active";
  const [editing, setEditing] = useState<MenuItemOut | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const query = useQuery({
    queryKey: ["menu-items", { limit, offset, active }],
    queryFn: () => listMenuItems({ limit, offset, active }),
  });

  const products = useQuery({
    queryKey: ["products-lookup"],
    queryFn: listProductsLookup,
    staleTime: 60_000,
  });

  const units = useQuery({
    queryKey: ["units-lookup"],
    queryFn: listUnitsLookup,
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: (values: MenuItemCreate & { is_active?: boolean }) =>
      editing ? updateMenuItem(editing.id, values) : createMenuItem(values),
    onSuccess: () => {
      message.success(editing ? "Сохранено" : "Позиция создана");
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteMenuItem(id),
    onSuccess: () => {
      message.success("Позиция деактивирована");
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openCreate() {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  }

  function openEdit(row: MenuItemOut) {
    setEditing(row);
    form.setFieldsValue({
      ...row,
      portion_qty: Number(row.portion_qty),
      sale_price: Number(row.sale_price),
    });
    setModalOpen(true);
  }

  const productName = (id: number) =>
    products.data?.items.find((p) => p.id === id)?.name ?? `#${id}`;
  const unitName = (id: number) => units.data?.items.find((u) => u.id === id)?.name ?? `#${id}`;

  const columns: ColumnsType<MenuItemOut> = [
    { title: "Название", dataIndex: "name" },
    { title: "Категория", dataIndex: "category", render: (v: string | null) => v ?? "—" },
    { title: "Продукт", dataIndex: "product_id", render: (v: number) => productName(v) },
    {
      title: "Порция",
      dataIndex: "portion_qty",
      render: (v: string, row) => `${fmtQty(v)} ${unitName(row.unit_id)}`,
    },
    {
      title: "Цена",
      dataIndex: "sale_price",
      align: "right",
      render: (v: string) => <Money value={v} />,
    },
    {
      title: "Статус",
      dataIndex: "is_active",
      width: 110,
      render: (v: boolean) => (v ? <Tag color="green">Активна</Tag> : <Tag>Неактивна</Tag>),
    },
    {
      title: "",
      width: 180,
      render: (_, row) =>
        canManage && (
          <Space>
            <a onClick={() => openEdit(row)}>Изменить</a>
            {row.is_active && (
              <Popconfirm
                title="Деактивировать позицию?"
                okText="Да"
                cancelText="Нет"
                onConfirm={() => remove.mutate(row.id)}
              >
                <a>Деактивировать</a>
              </Popconfirm>
            )}
          </Space>
        ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <Space>
          <h2 style={{ margin: 0 }}>Меню</h2>
          <Select
            style={{ width: 160 }}
            value={activeFilter}
            onChange={(v) => {
              setActiveFilter(v);
              reset();
            }}
            options={[
              { value: "all", label: "Все позиции" },
              { value: "active", label: "Активные" },
              { value: "inactive", label: "Неактивные" },
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
        rowKey="id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        pagination={tablePagination(query.data?.total)}
        columns={columns}
      />
      <Modal
        title={editing ? "Изменить позицию меню" : "Новая позиция меню"}
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
            name="product_id"
            label="Продукт (списание со склада)"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              loading={products.isPending}
              options={products.data?.items.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Form.Item>
          <Form.Item
            name="unit_id"
            label="Единица измерения порции"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              loading={units.isPending}
              options={units.data?.items.map((u) => ({ value: u.id, label: u.name }))}
            />
          </Form.Item>
          <Form.Item
            name="portion_qty"
            label="Количество на порцию"
            initialValue={1}
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <InputNumber min={0.000001} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="sale_price"
            label="Цена продажи"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <InputNumber min={0.01} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="category" label="Категория">
            <Input maxLength={256} />
          </Form.Item>
          {editing && (
            <Form.Item name="is_active" label="Активна" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
