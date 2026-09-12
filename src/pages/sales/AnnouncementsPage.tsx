/** /announcements — лента объявлений цеха для клиентского сайта (cap announcement.manage).
 *
 * Порядок в таблице тот же, что увидит клиент: сначала `display_order`, при
 * равенстве — свежее выше. Так редактор правит ленту, глядя ровно на неё, а не
 * на произвольную сортировку по id.
 */
import { PlusOutlined } from "@ant-design/icons";
import {
  App, Button, Card, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch,
  Table, Tag, Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createAnnouncement, deleteAnnouncement, getExtraOrderTerms, listAnnouncements,
  updateAnnouncement, updateExtraOrderTerms,
  type AnnouncementCreate, type AnnouncementOut, type ExtraOrderTerms,
} from "@/api/announcements";
import { errorMessage } from "@/api/client";
import { listAllMenuItems } from "@/api/sales";
import { useCan } from "@/auth/store";
import { fmtDate } from "@/components/format";
import { usePagination } from "@/components/usePagination";

export default function AnnouncementsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("announcement.manage");
  const { limit, offset, tablePagination, reset } = usePagination();
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "hidden">("all");
  const active = activeFilter === "all" ? undefined : activeFilter === "active";
  const [editing, setEditing] = useState<AnnouncementOut | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [extraForm] = Form.useForm<ExtraOrderTerms>();

  const query = useQuery({
    queryKey: ["announcements", { limit, offset, active }],
    queryFn: () => listAnnouncements({ limit, offset, active }),
  });

  // Полный список позиций: привязку выбирают из выпадающего списка, и обрезать
  // его страницей нельзя — нужной позиции просто не окажется.
  const menuItems = useQuery({
    queryKey: ["menu-items", "for-announcements"],
    queryFn: () => listAllMenuItems({ active: true }),
    staleTime: 60_000,
  });
  const itemName = (id: number | null) =>
    id == null
      ? null
      : menuItems.data?.find((m) => m.menu_item_id === id)?.name ?? `#${id}`;

  const extraTerms = useQuery({
    queryKey: ["extra-order-terms"],
    queryFn: getExtraOrderTerms,
  });
  useEffect(() => {
    if (!extraTerms.data) return;
    extraForm.setFieldsValue({
      ...extraTerms.data,
      body: extraTerms.data.body ?? "",
    });
  }, [extraTerms.data, extraForm]);

  const saveExtra = useMutation({
    mutationFn: (values: ExtraOrderTerms) => updateExtraOrderTerms(values),
    onSuccess: () => {
      message.success("Условия доп. заказа сохранены");
      queryClient.invalidateQueries({ queryKey: ["extra-order-terms"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["announcements"] });

  const save = useMutation({
    mutationFn: (values: AnnouncementCreate) =>
      editing
        ? updateAnnouncement(editing.announcement_id, values)
        : createAnnouncement(values),
    onSuccess: () => {
      message.success(editing ? "Сохранено" : "Объявление опубликовано");
      setModalOpen(false);
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  /** Скрыть/показать без открытия формы: это самая частая правка ленты. */
  const toggleActive = useMutation({
    mutationFn: (row: AnnouncementOut) =>
      updateAnnouncement(row.announcement_id, { is_active: !row.is_active }),
    onSuccess: (row) => {
      message.success(row.is_active ? "Показывается клиентам" : "Скрыто от клиентов");
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteAnnouncement(id),
    onSuccess: () => {
      message.success("Объявление удалено");
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openCreate() {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  }

  function openEdit(row: AnnouncementOut) {
    setEditing(row);
    form.setFieldsValue(row);
    setModalOpen(true);
  }

  const columns: ColumnsType<AnnouncementOut> = [
    {
      title: "Порядок",
      dataIndex: "display_order",
      width: 100,
      align: "center",
      render: (v: number) => (
        <Tooltip title="Меньше — выше в ленте у клиента">
          <span>{v}</span>
        </Tooltip>
      ),
    },
    {
      title: "Объявление",
      dataIndex: "title",
      render: (v: string, row) => (
        <Space align="start">
          {row.image_url && (
            <img
              src={row.image_url}
              alt=""
              style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8 }}
              // Ссылка может протухнуть — битую картинку прячем, текст остаётся.
              onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
            />
          )}
          <div>
            <div style={{ fontWeight: 600 }}>{v}</div>
            {row.body && (
              <div style={{ color: "#666", maxWidth: 520 }}>
                {row.body.length > 160 ? `${row.body.slice(0, 160)}…` : row.body}
              </div>
            )}
          </div>
        </Space>
      ),
    },
    {
      title: "Позиция меню",
      dataIndex: "menu_item_id",
      width: 190,
      render: (v: number | null) =>
        v == null ? (
          <span style={{ color: "#999" }}>—</span>
        ) : (
          <Tag color="blue">{itemName(v)}</Tag>
        ),
    },
    {
      title: "Опубликовано",
      dataIndex: "created_at",
      width: 130,
      render: (v: string) => fmtDate(v),
    },
    {
      title: "Видно клиентам",
      dataIndex: "is_active",
      width: 150,
      align: "center",
      render: (v: boolean, row) =>
        canManage ? (
          <Switch
            checked={v}
            loading={toggleActive.isPending}
            onClick={(_, e) => e.stopPropagation()}
            onChange={() => toggleActive.mutate(row)}
          />
        ) : v ? (
          <Tag color="green">Да</Tag>
        ) : (
          <Tag>Нет</Tag>
        ),
    },
    {
      title: "",
      width: 90,
      render: (_, row) =>
        canManage ? (
          <Popconfirm
            title="Удалить объявление?"
            description="Текст будет потерян. Чтобы просто убрать его из ленты, выключите «Видно клиентам»."
            okText="Удалить"
            cancelText="Отмена"
            okButtonProps={{ danger: true }}
            onConfirm={() => remove.mutate(row.announcement_id)}
          >
            <a style={{ color: "#cf1322" }} onClick={(e) => e.stopPropagation()}>
              Удалить
            </a>
          </Popconfirm>
        ) : null,
    },
  ];

  return (
    <div>
      <Card
        size="small"
        title="Доп заказ на клиентском сайте"
        style={{ marginBottom: 16 }}
        extra={
          canManage && (
            <Button
              type="primary"
              loading={saveExtra.isPending}
              disabled={extraTerms.isPending}
              onClick={() => extraForm.submit()}
            >
              Сохранить условия
            </Button>
          )
        }
      >
        <Form
          form={extraForm}
          layout="vertical"
          disabled={!canManage}
          onFinish={(v) =>
            saveExtra.mutate({
              is_enabled: Boolean(v.is_enabled),
              title: v.title,
              body: (v.body ?? "").trim() || null,
            })
          }
        >
          <Form.Item
            name="is_enabled"
            label="Показывать клиентам"
            valuePropName="checked"
            extra="Выключено — галочки на сайте нет, клиент не сможет пометить заказ как доп. Оператор кассы ставит метку всегда."
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="title"
            label="Заголовок"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Input maxLength={255} placeholder="Доп заказ" />
          </Form.Item>
          <Form.Item
            name="body"
            label="Условия"
            extra="Этот текст увидит клиент рядом с галочкой, когда собирает заказ."
          >
            <Input.TextArea
              rows={4}
              placeholder="Например: доп. заказ принимаем до 14:00, без минимальной суммы, привезём вместе с основным."
            />
          </Form.Item>
        </Form>
      </Card>

      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <Space>
          <h2 style={{ margin: 0 }}>Объявления</h2>
          <Select
            style={{ width: 200 }}
            value={activeFilter}
            onChange={(v) => {
              setActiveFilter(v);
              reset();
            }}
            options={[
              { value: "all", label: "Все" },
              { value: "active", label: "Видно клиентам" },
              { value: "hidden", label: "Скрытые" },
            ]}
          />
        </Space>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Написать
          </Button>
        )}
      </Space>

      <Table
        rowKey="announcement_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        pagination={tablePagination(query.data?.total)}
        columns={columns}
        rowClassName={() => "row-clickable"}
        onRow={(row) => ({ onClick: () => canManage && openEdit(row) })}
      />

      <Modal
        title={editing ? "Изменить объявление" : "Новое объявление"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={save.isPending}
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Form.Item
            name="title"
            label="Заголовок"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Input maxLength={255} placeholder="Например: 1 января цех не работает" />
          </Form.Item>
          <Form.Item name="body" label="Текст">
            <Input.TextArea rows={5} placeholder="Что нужно знать клиентам" />
          </Form.Item>
          <Form.Item
            name="image_url"
            label="Картинка (ссылка)"
            tooltip="Своего хранилища файлов нет — вставьте ссылку на изображение"
          >
            <Input maxLength={1024} placeholder="https://…" />
          </Form.Item>
          <Form.Item
            name="menu_item_id"
            label="Позиция меню"
            tooltip="Если указана, у клиента в объявлении появится кнопка «Заказать» с этой позицией"
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Не привязано"
              loading={menuItems.isPending}
              options={menuItems.data?.map((m) => ({
                value: m.menu_item_id,
                label: m.name,
              }))}
            />
          </Form.Item>
          <Space size="large" align="start">
            <Form.Item
              name="display_order"
              label="Порядок"
              initialValue={0}
              tooltip="Меньше — выше в ленте у клиента"
            >
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item
              name="is_active"
              label="Видно клиентам"
              valuePropName="checked"
              initialValue={true}
            >
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
