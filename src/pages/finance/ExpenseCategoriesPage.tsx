import { PlusOutlined } from "@ant-design/icons";
import { App, Button, Form, Input, Modal, Popconfirm, Space, Switch, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  createExpenseCategory,
  deactivateExpenseCategory,
  listExpenseCategories,
  updateExpenseCategory,
  type ExpenseCategoryOut,
} from "@/api/finance";
import { useCan } from "@/auth/store";

interface CategoryForm {
  name: string;
  is_active: boolean;
}

export default function ExpenseCategoriesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("finance.manage");
  const [editing, setEditing] = useState<ExpenseCategoryOut | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<CategoryForm>();

  const query = useQuery({
    queryKey: ["expense-categories"],
    queryFn: () => listExpenseCategories(),
  });

  const save = useMutation({
    mutationFn: (values: CategoryForm) =>
      editing
        ? updateExpenseCategory(editing.id, { name: values.name, is_active: values.is_active })
        : createExpenseCategory({ name: values.name }),
    onSuccess: () => {
      message.success(editing ? "Сохранено" : "Создано");
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const deactivate = useMutation({
    mutationFn: (id: number) => deactivateExpenseCategory(id),
    onSuccess: () => {
      message.success("Статья деактивирована");
      queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openCreate() {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ name: "", is_active: true });
    setModalOpen(true);
  }
  function openEdit(row: ExpenseCategoryOut) {
    setEditing(row);
    form.setFieldsValue({ name: row.name, is_active: row.is_active });
    setModalOpen(true);
  }

  const columns: ColumnsType<ExpenseCategoryOut> = [
    { title: "Название", dataIndex: "name" },
    {
      title: "Статус",
      dataIndex: "is_active",
      width: 130,
      render: (active: boolean) =>
        active ? <Tag color="green">Активна</Tag> : <Tag>Неактивна</Tag>,
    },
    {
      title: "",
      width: 200,
      render: (_, row) =>
        canManage && (
          <Space>
            <a onClick={() => openEdit(row)}>Изменить</a>
            {row.is_active && (
              <Popconfirm
                title="Деактивировать статью?"
                okText="Да"
                cancelText="Нет"
                onConfirm={() => deactivate.mutate(row.id)}
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
        <h2 style={{ margin: 0 }}>Статьи расходов</h2>
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
        dataSource={query.data}
        pagination={false}
        columns={columns}
      />
      <Modal
        title={editing ? "Изменить статью" : "Новая статья"}
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
