/** Вкладка «Список складов»: справочник складов.
 *
 * Бэкенд умеет только создание и деактивацию (переименования нет), поэтому это
 * создать / показать / деактивировать.
 */
import { PlusOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  createWarehouse,
  deleteWarehouse,
  listWarehouses,
  type WarehouseOut,
} from "@/api/inventory";
import { useCan } from "@/auth/store";
import { fmtDateTime } from "@/components/format";
import { usePagination } from "@/components/usePagination";

export default function WarehouseListTab() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("inventory.manage");
  const { limit, offset, tablePagination } = usePagination();
  const [includeInactive, setIncludeInactive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<{ name: string }>();

  const query = useQuery({
    queryKey: ["warehouses", { limit, offset, includeInactive }],
    queryFn: () =>
      listWarehouses({ limit, offset, include_inactive: includeInactive }),
  });

  const create = useMutation({
    mutationFn: (values: { name: string }) => createWarehouse(values),
    onSuccess: () => {
      message.success("Склад создан");
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      queryClient.invalidateQueries({ queryKey: ["lookup", "warehouses"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteWarehouse(id),
    onSuccess: () => {
      message.success("Склад деактивирован");
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      queryClient.invalidateQueries({ queryKey: ["lookup", "warehouses"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openCreate() {
    form.resetFields();
    setModalOpen(true);
  }

  return (
    <div>
      <Space
        style={{ marginBottom: 16, justifyContent: "flex-end", width: "100%" }}
      >
        <Space size={6}>
          <Switch
            checked={includeInactive}
            onChange={setIncludeInactive}
            size="small"
          />
          <span>Показывать неактивные</span>
        </Space>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Добавить
          </Button>
        )}
      </Space>

      <Table<WarehouseOut>
        rowKey="warehouse_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        pagination={tablePagination(query.data?.total)}
        columns={[
          { title: "Название", dataIndex: "name" },
          {
            title: "Статус",
            dataIndex: "is_active",
            width: 130,
            render: (active: boolean) =>
              active ? (
                <Tag color="green">Активен</Tag>
              ) : (
                <Tag>Неактивен</Tag>
              ),
          },
          {
            title: "Создан",
            dataIndex: "created_at",
            width: 160,
            render: (v: string) => fmtDateTime(v),
          },
          {
            title: "",
            width: 130,
            render: (_, row) =>
              canManage &&
              row.is_active && (
                <Popconfirm
                  title="Деактивировать склад?"
                  okText="Деактивировать"
                  cancelText="Отмена"
                  onConfirm={() => remove.mutate(row.warehouse_id)}
                >
                  <a>Деактивировать</a>
                </Popconfirm>
              ),
          },
        ]}
      />

      <Modal
        title="Новый склад"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Создать"
        cancelText="Отмена"
        confirmLoading={create.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => create.mutate(v)}>
          <Form.Item
            name="name"
            label="Название"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Input autoFocus maxLength={256} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
