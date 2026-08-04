/** Вкладка «Позиции»: что продаём и по какой базовой цене (cap menu.manage).
 *
 * Цена здесь — цена «Основного меню». Отклонения для остальных прайс-листов живут
 * на вкладке «Прайс-листы» → конкретное меню.
 */
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
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
import NutritionModal from "@/components/NutritionModal";
import { Money, fmtQty } from "@/components/format";
import { useListControls } from "@/components/useListControls";
import { usePagination } from "@/components/usePagination";

export default function MenuItemsTab() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("menu.manage");
  const { limit, offset, tablePagination, reset } = usePagination();
  const { search, setSearch, searchParam, sort, onTableChange } =
    useListControls<MenuItemOut>({ onReset: reset });
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("active");
  const active = activeFilter === "all" ? undefined : activeFilter === "active";
  const [editing, setEditing] = useState<MenuItemOut | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  /** Позиция, для которой открыт расчёт КБЖУ порции. */
  const [nutritionOf, setNutritionOf] = useState<MenuItemOut | null>(null);
  const [form] = Form.useForm();

  const query = useQuery({
    queryKey: ["menu-items", { limit, offset, active, searchParam, sort }],
    queryFn: () => listMenuItems({ limit, offset, active, search: searchParam, sort }),
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
      editing ? updateMenuItem(editing.menu_item_id, values) : createMenuItem(values),
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
    products.data?.items.find((p) => p.product_id === id)?.name ?? `#${id}`;
  const unitName = (id: number) => units.data?.items.find((u) => u.unit_id === id)?.name ?? `#${id}`;

  const columns: ColumnsType<MenuItemOut> = [
    { title: "Название", dataIndex: "name", sorter: true },
    { title: "Категория", dataIndex: "category", sorter: true, render: (v: string | null) => v ?? "—" },
    { title: "Продукт", dataIndex: "product_id", render: (v: number) => productName(v) },
    {
      title: "Порция",
      dataIndex: "portion_qty",
      render: (v: string, row) => `${fmtQty(v)} ${unitName(row.unit_id)}`,
    },
    {
      title: "Базовая цена",
      dataIndex: "sale_price",
      align: "right",
      sorter: true,
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
      width: 230,
      render: (_, row) => (
        <Space>
          <a onClick={() => setNutritionOf(row)}>КБЖУ</a>
          {canManage && (
            <a onClick={() => openEdit(row)}>Изменить</a>
          )}
          {canManage && row.is_active && (
            <Popconfirm
              title="Деактивировать позицию?"
              okText="Да"
              cancelText="Нет"
              onConfirm={() => remove.mutate(row.menu_item_id)}
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
        <Space wrap>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Поиск по названию"
            style={{ width: 240 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
        rowKey="menu_item_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        pagination={tablePagination(query.data?.total)}
        columns={columns}
        onChange={onTableChange}
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
              options={products.data?.items.map((p) => ({ value: p.product_id, label: p.name }))}
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
              options={units.data?.items.map((u) => ({ value: u.unit_id, label: u.name }))}
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
            label="Базовая цена продажи"
            tooltip="Цена «Основного меню»; остальные прайс-листы задают только отличия"
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

      <NutritionModal
        target={nutritionOf ? { kind: "menu-item", id: nutritionOf.menu_item_id } : null}
        title={nutritionOf?.name ?? ""}
        onClose={() => setNutritionOf(null)}
      />
    </div>
  );
}
