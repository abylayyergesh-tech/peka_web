/** Вкладка «Прайс-листы»: меню клиентов + CRUD (cap menu.manage).
 *
 * «Основное меню» (is_default) — это базовые цены с вкладки «Позиции», у него нет
 * своих отклонений и его нельзя удалить. Остальные меню задают только отличия
 * от базы, поэтому в колонке «Отклонений» у дефолтного всегда прочерк.
 */
import { PlusOutlined } from "@ant-design/icons";
import { App, Button, Descriptions, Form, Input, Popconfirm, Space, Switch, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  createMenu,
  deleteMenu,
  listMenuPrices,
  listMenus,
  updateMenu,
  type MenuCreate,
  type MenuOut,
} from "@/api/sales";
import { useCan } from "@/auth/store";
import EntityCardDrawer from "@/components/EntityCardDrawer";

export default function PriceListsTab() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("menu.manage");
  const [editing, setEditing] = useState<MenuOut | null>(null);
  const [open, setOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [form] = Form.useForm();

  const query = useQuery({ queryKey: ["menus"], queryFn: () => listMenus() });

  // Счётчик отклонений на каждое неосновное меню — иначе непонятно, наполнен
  // прайс или пуст.
  const nonDefault = (query.data ?? []).filter((m) => !m.is_default);
  const priceCounts = useQueries({
    queries: nonDefault.map((m) => ({
      queryKey: ["menu-prices", m.menu_id],
      queryFn: () => listMenuPrices(m.menu_id),
      staleTime: 60_000,
    })),
  });
  const countFor = (menuId: number) => {
    const idx = nonDefault.findIndex((m) => m.menu_id === menuId);
    return idx === -1 ? undefined : priceCounts[idx]?.data?.length;
  };

  const save = useMutation({
    mutationFn: (values: MenuCreate & { is_active?: boolean }) =>
      editing ? updateMenu(editing.menu_id, values) : createMenu(values),
    onSuccess: (row) => {
      message.success(editing ? "Сохранено" : "Меню создано");
      setEditing(row);
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ["menus"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteMenu(id),
    onSuccess: () => {
      message.success("Меню деактивировано");
      queryClient.invalidateQueries({ queryKey: ["menus"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const makeDefault = useMutation({
    mutationFn: (id: number) => updateMenu(id, { is_default: true }),
    onSuccess: () => {
      message.success("Меню сделано основным");
      queryClient.invalidateQueries({ queryKey: ["menus"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openCreate() {
    setEditing(null);
    form.resetFields();
    setIsEditing(true);
    setOpen(true);
  }

  function fillForm(row: MenuOut) {
    form.setFieldsValue(row);
  }

  function openCard(row: MenuOut) {
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

  const columns: ColumnsType<MenuOut> = [
    {
      title: "Меню",
      dataIndex: "name",
      render: (v: string, row) =>
        row.is_default ? v : <Link to={`/menus/${row.menu_id}`}>{v}</Link>,
    },
    {
      title: "Код iiko",
      dataIndex: "code",
      width: 110,
      render: (v: string | null) => v ?? "—",
    },
    {
      title: "Отклонений от базы",
      key: "prices",
      width: 180,
      align: "right",
      render: (_, row) => {
        if (row.is_default) return <span style={{ color: "#999" }}>базовые цены</span>;
        const n = countFor(row.menu_id);
        return n === undefined ? "…" : n;
      },
    },
    {
      title: "Основное",
      dataIndex: "is_default",
      width: 120,
      render: (v: boolean) => (v ? <Tag color="blue">Основное</Tag> : null),
    },
    {
      title: "Статус",
      dataIndex: "is_active",
      width: 120,
      render: (v: boolean) => (v ? <Tag color="green">Активно</Tag> : <Tag>Неактивно</Tag>),
    },
    {
      title: "",
      width: 220,
      render: (_, row) =>
        canManage ? (
          <Space>
            {!row.is_default && (
              <Link to={`/menus/${row.menu_id}`} onClick={(e) => e.stopPropagation()}>
                Цены
              </Link>
            )}
            {!row.is_default && row.is_active && (
              <Popconfirm
                title="Сделать основным?"
                description="Базовые цены позиций станут ценами этого меню по умолчанию."
                okText="Да"
                cancelText="Нет"
                onConfirm={() => makeDefault.mutate(row.menu_id)}
              >
                <a onClick={(e) => e.stopPropagation()}>Сделать основным</a>
              </Popconfirm>
            )}
            {!row.is_default && row.is_active && (
              <Popconfirm
                title="Деактивировать меню?"
                okText="Да"
                cancelText="Нет"
                onConfirm={() => remove.mutate(row.menu_id)}
              >
                <a onClick={(e) => e.stopPropagation()}>Деактивировать</a>
              </Popconfirm>
            )}
          </Space>
        ) : null,
    },
  ];

  return (
    <div>
      {canManage && (
        <Space style={{ marginBottom: 16, justifyContent: "flex-end", width: "100%" }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Добавить меню
          </Button>
        </Space>
      )}
      <Table
        rowKey="menu_id"
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
        title={editing?.name ?? "Новое меню"}
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
        extra={
          editing && !editing.is_default ? (
            <Link to={`/menus/${editing.menu_id}`}>Цены</Link>
          ) : undefined
        }
        view={
          editing ? (
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Меню">{editing.name}</Descriptions.Item>
              <Descriptions.Item label="Код iiko">{editing.code ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Основное">
                {editing.is_default ? <Tag color="blue">Основное</Tag> : "Нет"}
              </Descriptions.Item>
              <Descriptions.Item label="Статус">
                {editing.is_active ? <Tag color="green">Активно</Tag> : <Tag>Неактивно</Tag>}
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
            <Input maxLength={256} placeholder="Например: Zebra Coffee" />
          </Form.Item>
          <Form.Item
            name="code"
            label="Код ценовой категории iiko"
            tooltip="Заполняется импортом из iiko; вручную можно оставить пустым"
          >
            <Input maxLength={64} />
          </Form.Item>
          {editing && !editing.is_default && (
            <Form.Item name="is_active" label="Активно" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
        }
      />
    </div>
  );
}
