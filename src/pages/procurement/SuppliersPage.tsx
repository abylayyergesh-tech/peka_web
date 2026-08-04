/** /suppliers — supplier list with CRUD modal (cap supplier.manage). */
import { PlusOutlined } from "@ant-design/icons";
import { App, Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { errorMessage } from "@/api/client";
import {
  createSupplier,
  deleteSupplier,
  listSuppliers,
  updateSupplier,
  type SupplierCreate,
  type SupplierOut,
} from "@/api/procurement";
import { useCan } from "@/auth/store";
import { usePagination } from "@/components/usePagination";
import { nullIfEmpty } from "@/pages/procurement/refData";

interface SupplierFormValues {
  name: string;
  tax_id?: string;
  phone?: string;
  email?: string;
  note?: string;
}

export default function SuppliersPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("supplier.manage");
  const { limit, offset, tablePagination, reset } = usePagination();
  const [active, setActive] = useState<boolean | undefined>(undefined);
  const [editing, setEditing] = useState<SupplierOut | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<SupplierFormValues>();

  const query = useQuery({
    queryKey: ["suppliers", { limit, offset, active }],
    queryFn: () => listSuppliers({ limit, offset, active }),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    queryClient.invalidateQueries({ queryKey: ["procurement", "supplier-refs"] });
    // Оцифровка накладной и формы приходов берут справочник хуком
    // useSuppliersLookup — у него свой ключ кэша.
    queryClient.invalidateQueries({ queryKey: ["lookup", "suppliers"] });
  }

  const save = useMutation({
    mutationFn: (values: SupplierFormValues) => {
      const body: SupplierCreate = {
        name: values.name,
        tax_id: nullIfEmpty(values.tax_id),
        phone: nullIfEmpty(values.phone),
        email: nullIfEmpty(values.email),
        note: nullIfEmpty(values.note),
      };
      return editing ? updateSupplier(editing.supplier_id, body) : createSupplier(body);
    },
    onSuccess: () => {
      message.success(editing ? "Сохранено" : "Поставщик создан");
      setModalOpen(false);
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteSupplier(id),
    onSuccess: () => {
      message.success("Поставщик деактивирован");
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openCreate() {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  }

  function openEdit(row: SupplierOut) {
    setEditing(row);
    form.setFieldsValue({
      name: row.name,
      tax_id: row.tax_id ?? undefined,
      phone: row.phone ?? undefined,
      email: row.email ?? undefined,
      note: row.note ?? undefined,
    });
    setModalOpen(true);
  }

  const columns: ColumnsType<SupplierOut> = [
    {
      title: "Название",
      dataIndex: "name",
      render: (_, row) => <Link to={`/suppliers/${row.supplier_id}`}>{row.name}</Link>,
    },
    { title: "ИНН/БИН", dataIndex: "tax_id", render: (v) => v ?? "—" },
    { title: "Телефон", dataIndex: "phone", render: (v) => v ?? "—" },
    { title: "Email", dataIndex: "email", render: (v) => v ?? "—" },
    {
      title: "Статус",
      dataIndex: "is_active",
      width: 110,
      render: (v: boolean) =>
        v ? <Tag color="green">Активен</Tag> : <Tag color="red">Неактивен</Tag>,
    },
    {
      title: "",
      width: 170,
      render: (_, row) =>
        canManage && (
          <Space>
            <a onClick={() => openEdit(row)}>Изменить</a>
            {row.is_active && (
              <Popconfirm
                title="Деактивировать поставщика?"
                okText="Да"
                cancelText="Отмена"
                onConfirm={() => remove.mutate(row.supplier_id)}
              >
                <a style={{ color: "#cf1322" }}>Удалить</a>
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
          <h2 style={{ margin: 0 }}>Поставщики</h2>
          <Select
            allowClear
            placeholder="Все"
            style={{ width: 160 }}
            value={active}
            onChange={(v) => {
              setActive(v);
              reset();
            }}
            options={[
              { value: true, label: "Активные" },
              { value: false, label: "Неактивные" },
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
        rowKey="supplier_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        pagination={tablePagination(query.data?.total)}
        columns={columns}
      />
      <Modal
        title={editing ? "Изменить поставщика" : "Новый поставщик"}
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
          <Form.Item name="tax_id" label="ИНН/БИН">
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item name="phone" label="Телефон">
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item
            name="email"
            label="Email"
            rules={[{ type: "email", message: "Некорректный email" }]}
          >
            <Input maxLength={256} />
          </Form.Item>
          <Form.Item name="note" label="Примечание">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
