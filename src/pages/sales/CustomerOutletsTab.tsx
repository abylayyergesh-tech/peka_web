/** Точки (кофейни) клиента: список + CRUD (cap customer.manage).
 *
 * Клиент — это юрлицо. У сети кофеен один БИН и одна карточка клиента, а адреса
 * лежат здесь: из iiko они приезжали внутри названия («Байтурсынова 16, Zebra
 * Coffee»), поэтому у большинства точек `label` — исходное имя, а `address_line` —
 * распознанный из него адрес.
 *
 * Удаление мягкое: на точку ссылаются прошлые заказы и чеки.
 */
import { PlusOutlined } from "@ant-design/icons";
import { App, Button, Descriptions, Form, Input, Popconfirm, Space, Switch, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import { listAssignments } from "@/api/delivery";
import {
  createCustomerAddress,
  deleteCustomerAddress,
  listCustomerAddresses,
  updateCustomerAddress,
  type CustomerAddressCreate,
  type CustomerAddressOut,
} from "@/api/sales";
import { useCan } from "@/auth/store";
import EntityCardDrawer from "@/components/EntityCardDrawer";

export default function CustomerOutletsTab({ customerId }: { customerId: number }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("customer.manage");
  const [editing, setEditing] = useState<CustomerAddressOut | null>(null);
  const [open, setOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [form] = Form.useForm();

  const query = useQuery({
    queryKey: ["customer-addresses", customerId],
    queryFn: () => listCustomerAddresses(customerId),
    enabled: Number.isFinite(customerId),
  });
  const assignments = useQuery({
    queryKey: ["delivery-assignments"],
    queryFn: listAssignments,
  });
  const courierByAddress = useMemo(() => {
    const map = new Map<number, string>();
    for (const row of assignments.data ?? []) {
      if (row.customer_address_id != null && row.courier_name) {
        map.set(row.customer_address_id, row.courier_name);
      }
    }
    return map;
  }, [assignments.data]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["customer-addresses", customerId] });
  };

  const save = useMutation({
    mutationFn: (values: CustomerAddressCreate) =>
      editing
        ? updateCustomerAddress(editing.customer_address_id, values)
        : createCustomerAddress(customerId, values),
    onSuccess: (row) => {
      message.success(editing ? "Точка сохранена" : "Точка добавлена");
      setEditing(row);
      setIsEditing(false);
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteCustomerAddress(id),
    onSuccess: () => {
      message.success("Точка деактивирована");
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const makeDefault = useMutation({
    mutationFn: (id: number) => updateCustomerAddress(id, { is_default: true }),
    onSuccess: () => {
      message.success("Точка сделана основной");
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openCreate() {
    setEditing(null);
    form.resetFields();
    setIsEditing(true);
    setOpen(true);
  }

  function fillForm(row: CustomerAddressOut) {
    form.setFieldsValue(row);
  }

  function openCard(row: CustomerAddressOut) {
    setEditing(row);
    fillForm(row);
    setIsEditing(false);
    setOpen(true);
  }

  function closeCard() {
    setOpen(false);
    setIsEditing(false);
    setEditing(null);
  }

  const columns: ColumnsType<CustomerAddressOut> = [
    {
      title: "Название точки",
      dataIndex: "label",
      render: (v: string | null) => v ?? "—",
    },
    { title: "Адрес", dataIndex: "address_line" },
    {
      title: "Способ входа",
      dataIndex: "comment",
      render: (v: string | null) => v || "—",
    },
    {
      title: "Курьер (завтра)",
      width: 180,
      render: (_, row) => {
        const name = courierByAddress.get(row.customer_address_id);
        return name ? <Tag color="blue">{name}</Tag> : <span style={{ color: "#999" }}>—</span>;
      },
    },
    {
      title: "Контакт",
      key: "contact",
      width: 220,
      render: (_, row) =>
        [row.contact_name, row.contact_phone].filter(Boolean).join(" · ") || "—",
    },
    {
      title: "",
      dataIndex: "is_default",
      width: 110,
      render: (v: boolean) => (v ? <Tag color="blue">Основная</Tag> : null),
    },
    {
      title: "Статус",
      dataIndex: "is_active",
      width: 120,
      render: (v: boolean) => (v ? <Tag color="green">Активна</Tag> : <Tag>Закрыта</Tag>),
    },
    {
      title: "",
      width: 250,
      render: (_, row) =>
        canManage && (
          <Space>
            {row.is_active && !row.is_default && (
              <a
                onClick={(e) => {
                  e.stopPropagation();
                  makeDefault.mutate(row.customer_address_id);
                }}
              >
                Сделать основной
              </a>
            )}
            {row.is_active && (
              <Popconfirm
                title="Закрыть точку?"
                description="Прошлые заказы и чеки на неё останутся."
                okText="Да"
                cancelText="Нет"
                onConfirm={() => remove.mutate(row.customer_address_id)}
              >
                <a onClick={(e) => e.stopPropagation()}>Закрыть</a>
              </Popconfirm>
            )}
          </Space>
        ),
    },
  ];

  return (
    <div>
      {canManage && (
        <Button
          type="primary"
          icon={<PlusOutlined />}
          style={{ marginBottom: 12 }}
          onClick={openCreate}
        >
          Добавить точку
        </Button>
      )}
      <Table
        rowKey="customer_address_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data}
        pagination={false}
        columns={columns}
        locale={{ emptyText: "Точек нет — добавьте адрес, иначе курьеру некуда везти" }}
        rowClassName={() => "row-clickable"}
        onRow={(row) => ({ onClick: () => openCard(row) })}
      />
      <EntityCardDrawer
        open={open}
        onClose={closeCard}
        title={editing?.label || editing?.address_line || "Новая точка"}
        canEdit={canManage && editing != null}
        editing={isEditing}
        onStartEdit={() => {
          if (editing) fillForm(editing);
          setIsEditing(true);
        }}
        onCancelEdit={() => {
          if (editing) {
            fillForm(editing);
            setIsEditing(false);
          } else {
            closeCard();
          }
        }}
        onSave={() => form.submit()}
        savePending={save.isPending}
        view={
          editing ? (
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Название">{editing.label || "—"}</Descriptions.Item>
              <Descriptions.Item label="Адрес">{editing.address_line}</Descriptions.Item>
              <Descriptions.Item label="Способ входа">{editing.comment || "—"}</Descriptions.Item>
              <Descriptions.Item label="Контакт">
                {[editing.contact_name, editing.contact_phone].filter(Boolean).join(" · ") || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Основная">
                {editing.is_default ? <Tag color="blue">Основная</Tag> : "Нет"}
              </Descriptions.Item>
              <Descriptions.Item label="Статус">
                {editing.is_active ? <Tag color="green">Активна</Tag> : <Tag>Закрыта</Tag>}
              </Descriptions.Item>
            </Descriptions>
          ) : null
        }
        form={
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Form.Item
            name="address_line"
            label="Адрес"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Input placeholder="Например: Байтурсынова 16" />
          </Form.Item>
          <Form.Item
            name="label"
            label="Название точки"
            tooltip="Как её называют между собой — «Байтурсынова 16, Zebra Coffee»"
          >
            <Input maxLength={128} />
          </Form.Item>
          <Form.Item name="contact_name" label="Контактное лицо">
            <Input maxLength={256} />
          </Form.Item>
          <Form.Item name="contact_phone" label="Телефон точки">
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item
            name="comment"
            label="Способ входа"
            tooltip="Код домофона, вход со двора, когда звонить. Курьер видит это в маршруте."
          >
            <Input.TextArea rows={2} placeholder="Вход со двора, домофон 12" />
          </Form.Item>
          <Form.Item name="is_default" label="Основная точка" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
        }
      />
    </div>
  );
}
