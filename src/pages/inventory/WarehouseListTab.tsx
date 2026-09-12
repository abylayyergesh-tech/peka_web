/** Вкладка «Список складов»: справочник складов. */
import { PlusOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Descriptions,
  Form,
  Input,
  Popconfirm,
  Select,
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
  updateWarehouse,
  type WarehouseOut,
  type WarehousePurpose,
} from "@/api/inventory";
import { useCan } from "@/auth/store";
import EntityCardDrawer from "@/components/EntityCardDrawer";
import { fmtDateTime } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import { WAREHOUSE_PURPOSE_LABELS } from "@/pages/inventory/shared";

type WarehouseForm = { name: string; purpose: WarehousePurpose };

const PURPOSE_OPTIONS = (
  Object.entries(WAREHOUSE_PURPOSE_LABELS) as [WarehousePurpose, string][]
).map(([value, label]) => ({ value, label }));

export default function WarehouseListTab() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("inventory.manage");
  const { limit, offset, tablePagination } = usePagination();
  const [includeInactive, setIncludeInactive] = useState(false);
  const [card, setCard] = useState<WarehouseOut | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form] = Form.useForm<WarehouseForm>();

  const query = useQuery({
    queryKey: ["warehouses", { limit, offset, includeInactive }],
    queryFn: () =>
      listWarehouses({ limit, offset, include_inactive: includeInactive }),
  });

  const fresh =
    query.data?.items.find((r) => r.warehouse_id === card?.warehouse_id) ?? card;

  function invalidateWarehouses() {
    queryClient.invalidateQueries({ queryKey: ["warehouses"] });
    queryClient.invalidateQueries({ queryKey: ["lookup", "warehouses"] });
  }

  const save = useMutation({
    mutationFn: (values: WarehouseForm) =>
      card ? updateWarehouse(card.warehouse_id, values) : createWarehouse(values),
    onSuccess: (row) => {
      message.success(card ? "Склад сохранён" : "Склад создан");
      setCard(row);
      setEditing(false);
      invalidateWarehouses();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteWarehouse(id),
    onSuccess: () => {
      message.success("Склад деактивирован");
      invalidateWarehouses();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function fillForm(row: WarehouseOut) {
    form.setFieldsValue({ name: row.name, purpose: row.purpose ?? "raw" });
  }

  function openCard(row: WarehouseOut) {
    setCard(row);
    fillForm(row);
    setEditing(false);
    setOpen(true);
  }

  function openCreate() {
    setCard(null);
    form.resetFields();
    form.setFieldsValue({ purpose: "raw" });
    setEditing(true);
    setOpen(true);
  }

  function closeCard() {
    setOpen(false);
    setEditing(false);
    setCard(null);
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
        rowClassName={() => "row-clickable"}
        onRow={(row) => ({ onClick: () => openCard(row) })}
        columns={[
          { title: "Название", dataIndex: "name" },
          {
            title: "Назначение",
            dataIndex: "purpose",
            width: 180,
            render: (purpose: WarehousePurpose) =>
              purpose === "finished" ? (
                <Tag color="blue">{WAREHOUSE_PURPOSE_LABELS.finished}</Tag>
              ) : (
                <Tag>{WAREHOUSE_PURPOSE_LABELS.raw}</Tag>
              ),
          },
          {
            title: "Статус",
            dataIndex: "is_active",
            width: 130,
            render: (active: boolean) =>
              active ? <Tag color="green">Активен</Tag> : <Tag>Неактивен</Tag>,
          },
          {
            title: "Создан",
            dataIndex: "created_at",
            width: 160,
            render: (v: string) => fmtDateTime(v),
          },
        ]}
      />

      <EntityCardDrawer
        open={open}
        onClose={closeCard}
        title={fresh?.name ?? "Новый склад"}
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
              title="Деактивировать склад?"
              okText="Деактивировать"
              cancelText="Отмена"
              onConfirm={() => remove.mutate(fresh.warehouse_id)}
            >
              <Button danger>Деактивировать</Button>
            </Popconfirm>
          ) : undefined
        }
        view={
          fresh ? (
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Название">{fresh.name}</Descriptions.Item>
              <Descriptions.Item label="Назначение">
                {WAREHOUSE_PURPOSE_LABELS[fresh.purpose]}
              </Descriptions.Item>
              <Descriptions.Item label="Статус">
                {fresh.is_active ? (
                  <Tag color="green">Активен</Tag>
                ) : (
                  <Tag>Неактивен</Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Создан">
                {fmtDateTime(fresh.created_at)}
              </Descriptions.Item>
            </Descriptions>
          ) : null
        }
        form={
          <Form form={form} layout="vertical" onFinish={(values) => save.mutate(values)}>
            <Form.Item
              name="name"
              label="Название"
              rules={[{ required: true, message: "Обязательное поле" }]}
            >
              <Input autoFocus maxLength={256} />
            </Form.Item>
            <Form.Item
              name="purpose"
              label="Назначение"
              rules={[{ required: true, message: "Обязательное поле" }]}
            >
              <Select options={PURPOSE_OPTIONS} />
            </Form.Item>
          </Form>
        }
      />
    </div>
  );
}
