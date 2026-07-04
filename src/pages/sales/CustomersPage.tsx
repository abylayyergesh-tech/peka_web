/** /customers — customer list + CRUD modal (cap customer.manage). */
import { PlusOutlined } from "@ant-design/icons";
import { App, Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  createCustomer, deleteCustomer, listCustomers, updateCustomer,
  type CustomerCreate, type CustomerOut,
} from "@/api/sales";
import { useCan } from "@/auth/store";
import { Money } from "@/components/format";
import { usePagination } from "@/components/usePagination";

export default function CustomersPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("customer.manage");
  const { limit, offset, tablePagination, reset } = usePagination();
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("active");
  const active = activeFilter === "all" ? undefined : activeFilter === "active";
  const [editing, setEditing] = useState<CustomerOut | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const query = useQuery({
    queryKey: ["customers", { limit, offset, active }],
    queryFn: () => listCustomers({ limit, offset, active }),
  });

  const save = useMutation({
    mutationFn: (values: CustomerCreate) =>
      editing ? updateCustomer(editing.id, values) : createCustomer(values),
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
      render: (v: string, row) => <Link to={`/customers/${row.id}`}>{v}</Link>,
    },
    { title: "Телефон", dataIndex: "phone", render: (v: string | null) => v ?? "—" },
    { title: "Email", dataIndex: "email", render: (v: string | null) => v ?? "—" },
    { title: "ИНН", dataIndex: "tax_id", render: (v: string | null) => v ?? "—" },
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
      width: 200,
      render: (_, row) => (
        <Space>
          <Link to={`/customers/${row.id}`}>Карточка</Link>
          {canManage && (
            <>
              <a onClick={() => openEdit(row)}>Изменить</a>
              {row.is_active && (
                <Popconfirm
                  title="Деактивировать клиента?"
                  okText="Да"
                  cancelText="Нет"
                  onConfirm={() => remove.mutate(row.id)}
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
          <Form.Item name="tax_id" label="ИНН">
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
    </div>
  );
}
