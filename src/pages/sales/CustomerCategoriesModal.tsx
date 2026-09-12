/** Справочник категорий клиентов: завести тип, переименовать, выключить.
 *
 * Открывается со страницы клиентов — категорию заводят в тот момент, когда
 * относят кофейню к «комп клубу», а не ходят за этим в другой раздел. */
import { PlusOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  createCustomerCategory,
  deactivateCustomerCategory,
  listCustomerCategories,
  updateCustomerCategory,
  type CustomerCategoryOut,
} from "@/api/sales";
import { useCan } from "@/auth/store";

export const CUSTOMER_CATEGORIES_KEY = ["customer-categories"];

export function useCustomerCategories(active?: boolean) {
  return useQuery({
    queryKey: [...CUSTOMER_CATEGORIES_KEY, active ?? "all"],
    queryFn: () => listCustomerCategories(active),
    staleTime: 60_000,
  });
}

export default function CustomerCategoriesModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("customer.manage");
  const [editing, setEditing] = useState<CustomerCategoryOut | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form] = Form.useForm<{ name: string }>();

  const query = useCustomerCategories();

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: CUSTOMER_CATEGORIES_KEY });
    queryClient.invalidateQueries({ queryKey: ["customers"] });
    queryClient.invalidateQueries({ queryKey: ["customer"] });
  }

  const save = useMutation({
    mutationFn: (values: { name: string }) => {
      const name = values.name.trim();
      return editing
        ? updateCustomerCategory(editing.customer_category_id, { name })
        : createCustomerCategory({ name });
    },
    onSuccess: (category) => {
      message.success(
        editing ? `Категория «${category.name}» сохранена` : "Категория создана",
      );
      setFormOpen(false);
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const deactivate = useMutation({
    mutationFn: (row: CustomerCategoryOut) =>
      deactivateCustomerCategory(row.customer_category_id),
    onSuccess: (category) => {
      message.success(`Категория «${category.name}» отключена`);
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const reactivate = useMutation({
    mutationFn: (row: CustomerCategoryOut) =>
      updateCustomerCategory(row.customer_category_id, { is_active: true }),
    onSuccess: (category) => {
      message.success(`Категория «${category.name}» включена`);
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const initialValues = editing ? { name: editing.name } : { name: "" };

  const columns: ColumnsType<CustomerCategoryOut> = [
    {
      title: "Категория",
      dataIndex: "name",
      render: (name: string, row) => (
        <Space>
          {name}
          {!row.is_active && <Tag>отключена</Tag>}
        </Space>
      ),
    },
    {
      title: "Клиентов",
      dataIndex: "customers_count",
      width: 100,
      align: "right",
      render: (n: number) =>
        n > 0 ? n : <Tag style={{ marginInlineEnd: 0 }}>нет</Tag>,
    },
    {
      title: "",
      width: 200,
      render: (_, row) =>
        canManage && (
          <Space size="middle">
            <a
              onClick={() => {
                setEditing(row);
                setFormOpen(true);
              }}
            >
              Изменить
            </a>
            {row.is_active ? (
              <Popconfirm
                title="Отключить категорию?"
                description={
                  row.customers_count > 0
                    ? `У ${row.customers_count} клиентов она останется. Новым её уже не поставят.`
                    : "Новым клиентам её не поставят."
                }
                okText="Отключить"
                cancelText="Нет"
                onConfirm={() => deactivate.mutate(row)}
              >
                <a>Отключить</a>
              </Popconfirm>
            ) : (
              <a onClick={() => reactivate.mutate(row)}>Включить</a>
            )}
          </Space>
        ),
    },
  ];

  return (
    <>
      <Modal
        title="Категории клиентов"
        open={open}
        onCancel={onClose}
        footer={null}
        width={640}
      >
        {canManage && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            style={{ marginBottom: 12 }}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            Новая категория
          </Button>
        )}
        <Table<CustomerCategoryOut>
          rowKey="customer_category_id"
          size="small"
          loading={query.isPending}
          dataSource={query.data}
          columns={columns}
          pagination={false}
          scroll={{ y: 420 }}
          locale={{ emptyText: "Категорий пока нет — заведите, например, «Комп клуб»" }}
        />
      </Modal>

      <Modal
        title={editing ? `Категория «${editing.name}»` : "Новая категория"}
        open={formOpen}
        onCancel={() => setFormOpen(false)}
        onOk={() => form.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={save.isPending}
        destroyOnHidden
      >
        <Form
          key={editing?.customer_category_id ?? "new"}
          form={form}
          layout="vertical"
          initialValues={initialValues}
          onFinish={(v) => save.mutate(v)}
        >
          <Form.Item
            name="name"
            label="Название"
            rules={[{ required: true, message: "Укажите название" }]}
          >
            <Input maxLength={256} placeholder="Например, Комп клуб" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
