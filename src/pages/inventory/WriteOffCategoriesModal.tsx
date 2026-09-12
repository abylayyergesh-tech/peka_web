/** Справочник категорий списания: завести причину, переименовать, выключить.
 *
 * Открывается с формы акта и со списка актов — категорию заводят в тот момент,
 * когда списывают, а не ходят за этим в другой раздел. Базовую «Списание»
 * выключить нельзя: у акта должна остаться хотя бы одна причина. */
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
  createWriteOffCategory,
  deactivateWriteOffCategory,
  listWriteOffCategories,
  updateWriteOffCategory,
  type WriteOffCategoryOut,
} from "@/api/inventory";
import { useCan } from "@/auth/store";

export const WRITE_OFF_CATEGORIES_KEY = ["write-off-categories"];

export function useWriteOffCategories(active?: boolean) {
  return useQuery({
    queryKey: [...WRITE_OFF_CATEGORIES_KEY, active ?? "all"],
    queryFn: () => listWriteOffCategories(active),
    staleTime: 60_000,
  });
}

export default function WriteOffCategoriesModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("inventory.manage");
  const [editing, setEditing] = useState<WriteOffCategoryOut | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form] = Form.useForm<{ name: string }>();

  const query = useWriteOffCategories();

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: WRITE_OFF_CATEGORIES_KEY });
    queryClient.invalidateQueries({ queryKey: ["documents"] });
    queryClient.invalidateQueries({ queryKey: ["write-offs"] });
  }

  const save = useMutation({
    mutationFn: (values: { name: string }) => {
      const name = values.name.trim();
      return editing
        ? updateWriteOffCategory(editing.write_off_category_id, { name })
        : createWriteOffCategory({ name });
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
    mutationFn: (row: WriteOffCategoryOut) =>
      deactivateWriteOffCategory(row.write_off_category_id),
    onSuccess: (category) => {
      message.success(`Категория «${category.name}» отключена`);
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const initialValues = editing ? { name: editing.name } : { name: "" };

  const columns: ColumnsType<WriteOffCategoryOut> = [
    {
      title: "Категория",
      dataIndex: "name",
      render: (name: string, row) => (
        <Space>
          {name}
          {row.is_default && <Tag color="blue">базовая</Tag>}
          {!row.is_active && <Tag>отключена</Tag>}
        </Space>
      ),
    },
    {
      title: "Актов",
      dataIndex: "documents_count",
      width: 90,
      align: "right",
      render: (n: number) =>
        n > 0 ? n : <Tag style={{ marginInlineEnd: 0 }}>нет</Tag>,
    },
    {
      title: "",
      width: 180,
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
            {!row.is_default && row.is_active && (
              <Popconfirm
                title="Отключить категорию?"
                description={
                  row.documents_count > 0
                    ? `В ${row.documents_count} актах она останется. Новые акты её уже не выберут.`
                    : "В новых актах её не будет."
                }
                okText="Отключить"
                cancelText="Нет"
                onConfirm={() => deactivate.mutate(row)}
              >
                <a>Отключить</a>
              </Popconfirm>
            )}
          </Space>
        ),
    },
  ];

  return (
    <>
      <Modal
        title="Категории списания"
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
        <Table<WriteOffCategoryOut>
          rowKey="write_off_category_id"
          size="small"
          loading={query.isPending}
          dataSource={query.data}
          columns={columns}
          pagination={false}
          scroll={{ y: 420 }}
          locale={{ emptyText: "Категорий пока нет" }}
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
            <Input maxLength={256} placeholder="Например, Порча продуктов" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
