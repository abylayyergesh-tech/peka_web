import { PlusOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  createProduct,
  deleteProduct,
  updateProduct,
  listProducts,
  type ProductKind,
  type ProductOut,
} from "@/api/catalog";
import { useCan } from "@/auth/store";
import { fmtDate } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import {
  PRODUCT_KIND_COLORS,
  PRODUCT_KIND_LABELS,
  PRODUCT_KIND_OPTIONS,
} from "@/pages/catalog/labels";
import { useUnitOptions } from "@/pages/catalog/useCatalogOptions";

interface ProductFormValues {
  name: string;
  kind: ProductKind;
  base_unit_id: number;
  sku?: string;
  category?: string;
}

export default function ProductsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("catalog.manage");
  const { limit, offset, tablePagination, reset } = usePagination();
  const units = useUnitOptions();

  const [kind, setKind] = useState<ProductKind | undefined>(undefined);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [editing, setEditing] = useState<ProductOut | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<ProductFormValues>();

  const query = useQuery({
    queryKey: ["products", { limit, offset, kind, includeInactive }],
    queryFn: () =>
      listProducts({ limit, offset, kind, include_inactive: includeInactive }),
  });

  const save = useMutation({
    mutationFn: (values: ProductFormValues) => {
      const body = {
        name: values.name,
        kind: values.kind,
        base_unit_id: values.base_unit_id,
        sku: values.sku?.trim() || null,
        category: values.category?.trim() || null,
      };
      return editing ? updateProduct(editing.id, body) : createProduct(body);
    },
    onSuccess: () => {
      message.success(editing ? "Сохранено" : "Создано");
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteProduct(id),
    onSuccess: () => {
      message.success("Продукт деактивирован");
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openCreate() {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  }
  function openEdit(row: ProductOut) {
    setEditing(row);
    form.setFieldsValue({
      name: row.name,
      kind: row.kind,
      base_unit_id: row.base_unit_id,
      sku: row.sku ?? undefined,
      category: row.category ?? undefined,
    });
    setModalOpen(true);
  }

  const columns: ColumnsType<ProductOut> = [
    { title: "Название", dataIndex: "name" },
    {
      title: "Тип",
      dataIndex: "kind",
      width: 140,
      render: (k: ProductKind) => (
        <Tag color={PRODUCT_KIND_COLORS[k]}>{PRODUCT_KIND_LABELS[k]}</Tag>
      ),
    },
    { title: "Артикул", dataIndex: "sku", render: (v: string | null) => v || "—" },
    {
      title: "Категория",
      dataIndex: "category",
      render: (v: string | null) => v || "—",
    },
    {
      title: "Базовая ед.",
      dataIndex: "base_unit_id",
      width: 130,
      render: (id: number) => units.nameOf(id),
    },
    {
      title: "Статус",
      dataIndex: "is_active",
      width: 110,
      render: (active: boolean) =>
        active ? <Tag color="green">Активен</Tag> : <Tag>Неактивен</Tag>,
    },
    {
      title: "Создан",
      dataIndex: "created_at",
      width: 120,
      render: (v: string) => fmtDate(v),
    },
    {
      title: "",
      width: 160,
      render: (_, row) =>
        canManage && (
          <Space size="middle">
            <a onClick={() => openEdit(row)}>Изменить</a>
            {row.is_active && (
              <Popconfirm
                title="Деактивировать продукт?"
                description="Он будет скрыт из списка (мягкое удаление)."
                okText="Да"
                cancelText="Нет"
                onConfirm={() => remove.mutate(row.id)}
              >
                <a>Удалить</a>
              </Popconfirm>
            )}
          </Space>
        ),
    },
  ];

  return (
    <div>
      <Space
        style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}
      >
        <h2 style={{ margin: 0 }}>Продукты</h2>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Добавить
          </Button>
        )}
      </Space>

      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          allowClear
          placeholder="Тип"
          style={{ width: 200 }}
          value={kind}
          options={PRODUCT_KIND_OPTIONS}
          onChange={(v) => {
            setKind(v);
            reset();
          }}
        />
        <Space size="small">
          <Switch
            checked={includeInactive}
            onChange={(v) => {
              setIncludeInactive(v);
              reset();
            }}
          />
          <span>Показывать неактивные</span>
        </Space>
      </Space>

      <Table<ProductOut>
        rowKey="id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        pagination={tablePagination(query.data?.total)}
        columns={columns}
      />

      <Modal
        title={editing ? "Изменить продукт" : "Новый продукт"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={save.isPending}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => save.mutate(v)}
        >
          <Form.Item
            name="name"
            label="Название"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Input maxLength={256} />
          </Form.Item>
          <Form.Item
            name="kind"
            label="Тип"
            rules={[{ required: true, message: "Выберите тип" }]}
          >
            <Select options={PRODUCT_KIND_OPTIONS} placeholder="Тип продукта" />
          </Form.Item>
          <Form.Item
            name="base_unit_id"
            label="Базовая единица"
            rules={[{ required: true, message: "Выберите единицу" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              loading={units.isLoading}
              options={units.options}
              placeholder="Единица измерения"
            />
          </Form.Item>
          <Form.Item name="sku" label="Артикул">
            <Input maxLength={128} />
          </Form.Item>
          <Form.Item name="category" label="Категория">
            <Input maxLength={256} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
