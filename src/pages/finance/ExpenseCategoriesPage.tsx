import { PlusOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Descriptions,
  Form,
  Input,
  Popconfirm,
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
  createExpenseCategory,
  deactivateExpenseCategory,
  listExpenseCategories,
  updateExpenseCategory,
  type ExpenseCategoryOut,
} from "@/api/finance";
import { useCan } from "@/auth/store";
import EntityCardDrawer from "@/components/EntityCardDrawer";

interface CategoryForm {
  name: string;
  is_active: boolean;
}

export default function ExpenseCategoriesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("finance.manage");
  const [card, setCard] = useState<ExpenseCategoryOut | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form] = Form.useForm<CategoryForm>();

  const query = useQuery({
    queryKey: ["expense-categories"],
    queryFn: () => listExpenseCategories(),
  });

  const fresh =
    query.data?.find((r) => r.expense_category_id === card?.expense_category_id) ?? card;

  const save = useMutation({
    mutationFn: (values: CategoryForm) =>
      card
        ? updateExpenseCategory(card.expense_category_id, {
            name: values.name,
            is_active: values.is_active,
          })
        : createExpenseCategory({ name: values.name }),
    onSuccess: (row) => {
      message.success(card ? "Сохранено" : "Создано");
      queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
      setCard(row);
      setEditing(false);
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

  function fillForm(row: ExpenseCategoryOut) {
    form.setFieldsValue({ name: row.name, is_active: row.is_active });
  }

  function openCard(row: ExpenseCategoryOut) {
    setCard(row);
    fillForm(row);
    setEditing(false);
    setOpen(true);
  }

  function openCreate() {
    setCard(null);
    form.resetFields();
    form.setFieldsValue({ name: "", is_active: true });
    setEditing(true);
    setOpen(true);
  }

  function closeCard() {
    setOpen(false);
    setEditing(false);
    setCard(null);
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
        rowKey="expense_category_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data}
        pagination={false}
        columns={columns}
        rowClassName={() => "row-clickable"}
        onRow={(row) => ({ onClick: () => openCard(row) })}
      />
      <EntityCardDrawer
        open={open}
        onClose={closeCard}
        title={fresh?.name ?? "Новая статья"}
        canEdit={canManage && fresh != null}
        editing={editing}
        onStartEdit={() => {
          if (fresh) fillForm(fresh);
          setEditing(true);
        }}
        onCancelEdit={() => {
          if (fresh) {
            fillForm(fresh);
            setEditing(false);
          } else {
            closeCard();
          }
        }}
        onSave={() => form.submit()}
        savePending={save.isPending}
        extra={
          fresh?.is_active && canManage ? (
            <Popconfirm
              title="Деактивировать статью?"
              okText="Да"
              cancelText="Нет"
              onConfirm={() => deactivate.mutate(fresh.expense_category_id)}
            >
              <Button danger>Деактивировать</Button>
            </Popconfirm>
          ) : undefined
        }
        view={
          fresh ? (
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Название">{fresh.name}</Descriptions.Item>
              <Descriptions.Item label="Статус">
                {fresh.is_active ? (
                  <Tag color="green">Активна</Tag>
                ) : (
                  <Tag>Неактивна</Tag>
                )}
              </Descriptions.Item>
            </Descriptions>
          ) : null
        }
        form={
          <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
            <Form.Item
              name="name"
              label="Название"
              rules={[{ required: true, message: "Обязательное поле" }]}
            >
              <Input maxLength={256} />
            </Form.Item>
            {card && (
              <Form.Item name="is_active" label="Активна" valuePropName="checked">
                <Switch />
              </Form.Item>
            )}
          </Form>
        }
      />
    </div>
  );
}
