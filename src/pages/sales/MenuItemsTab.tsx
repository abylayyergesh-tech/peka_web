/** Вкладка «Позиции»: что продаём и по какой базовой цене (cap menu.manage).
 *
 * Цена здесь — цена «Основного меню». Отклонения для остальных прайс-листов живут
 * на вкладке «Прайс-листы» → конкретное меню.
 */
import {
  PictureOutlined,
  PlusOutlined,
  SearchOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  App, Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch,
  Table, Tag, Upload,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage, mediaSrc } from "@/api/client";
import {
  createMenuItem,
  deleteMenuItem,
  deleteMenuItemImage,
  listMenuItems,
  listProductsLookup,
  listUnitsLookup,
  updateMenuItem,
  uploadMenuItemImage,
  type MenuItemCreate,
  type MenuItemOut,
} from "@/api/sales";
import { useCan } from "@/auth/store";
import NutritionModal from "@/components/NutritionModal";
import { Money, fmtQty } from "@/components/format";
import { useListControls } from "@/components/useListControls";
import { usePagination } from "@/components/usePagination";

export default function MenuItemsTab() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("menu.manage");
  const { limit, offset, tablePagination, reset } = usePagination();
  const { search, setSearch, searchParam, sort, onTableChange } =
    useListControls<MenuItemOut>({ onReset: reset });
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("active");
  const active = activeFilter === "all" ? undefined : activeFilter === "active";
  const [editing, setEditing] = useState<MenuItemOut | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  /** Позиция, для которой открыт расчёт КБЖУ порции. */
  const [nutritionOf, setNutritionOf] = useState<MenuItemOut | null>(null);
  /** Фото, выбранное для ЕЩЁ НЕ созданной позиции: загрузка требует id, поэтому
   *  файл ждёт здесь и уходит сразу после создания. */
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [form] = Form.useForm();

  const query = useQuery({
    queryKey: ["menu-items", { limit, offset, active, searchParam, sort }],
    queryFn: () => listMenuItems({ limit, offset, active, search: searchParam, sort }),
  });

  const products = useQuery({
    queryKey: ["products-lookup"],
    queryFn: listProductsLookup,
    staleTime: 60_000,
  });

  const units = useQuery({
    queryKey: ["units-lookup"],
    queryFn: listUnitsLookup,
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: async (values: MenuItemCreate & { is_active?: boolean }) => {
      const saved = editing
        ? await updateMenuItem(editing.menu_item_id, values)
        : await createMenuItem(values);
      // Файл, выбранный ДО сохранения новой позиции, уходит сразу после её
      // создания: загрузка требует id, а заставлять человека сохранить, снова
      // открыть карточку и только там добавить фото — лишний круг.
      if (pendingFile) {
        return await uploadMenuItemImage(saved.menu_item_id, pendingFile);
      }
      return saved;
    },
    onSuccess: () => {
      message.success(editing ? "Сохранено" : "Позиция создана");
      setPendingFile(null);
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  /** Загрузка фото у существующей позиции — сразу, не дожидаясь «Сохранить»:
   *  файл уже выбран, и держать его в подвешенном состоянии незачем. */
  const uploadImage = useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) =>
      uploadMenuItemImage(id, file),
    onSuccess: (saved) => {
      message.success("Фото загружено");
      setEditing(saved);
      form.setFieldValue("image_url", saved.image_url);
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const removeImage = useMutation({
    mutationFn: (id: number) => deleteMenuItemImage(id),
    onSuccess: (saved) => {
      message.success("Фото убрано");
      setEditing(saved);
      form.setFieldValue("image_url", null);
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteMenuItem(id),
    onSuccess: () => {
      message.success("Позиция деактивирована");
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openCreate() {
    setEditing(null);
    setPendingFile(null);
    form.resetFields();
    setModalOpen(true);
  }

  function openEdit(row: MenuItemOut) {
    setEditing(row);
    setPendingFile(null);
    form.setFieldsValue({
      ...row,
      portion_qty: Number(row.portion_qty),
      sale_price: Number(row.sale_price),
    });
    setModalOpen(true);
  }

  const productName = (id: number) =>
    products.data?.items.find((p) => p.product_id === id)?.name ?? `#${id}`;
  const unitName = (id: number) => units.data?.items.find((u) => u.unit_id === id)?.name ?? `#${id}`;

  const columns: ColumnsType<MenuItemOut> = [
    {
      // Миниатюра, а не галочка «есть фото»: сразу видно и то, что ссылка живая,
      // и что на картинке именно эта позиция. Битая ссылка покажет прочерк.
      title: "Фото",
      dataIndex: "image_url",
      width: 64,
      render: (v: string | null, row) =>
        v ? (
          <img
            src={mediaSrc(v)}
            alt={row.name}
            loading="lazy"
            style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6 }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <span style={{ color: "#bfbfbf" }}>—</span>
        ),
    },
    { title: "Название", dataIndex: "name", sorter: true },
    { title: "Категория", dataIndex: "category", sorter: true, render: (v: string | null) => v ?? "—" },
    { title: "Продукт", dataIndex: "product_id", render: (v: number) => productName(v) },
    {
      title: "Порция",
      dataIndex: "portion_qty",
      render: (v: string, row) => `${fmtQty(v)} ${unitName(row.unit_id)}`,
    },
    {
      title: "Базовая цена",
      dataIndex: "sale_price",
      align: "right",
      sorter: true,
      render: (v: string) => <Money value={v} />,
    },
    {
      title: "Статус",
      dataIndex: "is_active",
      width: 110,
      render: (v: boolean) => (v ? <Tag color="green">Активна</Tag> : <Tag>Неактивна</Tag>),
    },
    {
      title: "",
      width: 230,
      render: (_, row) => (
        <Space>
          <a onClick={() => setNutritionOf(row)}>КБЖУ</a>
          {canManage && (
            <a onClick={() => openEdit(row)}>Изменить</a>
          )}
          {canManage && row.is_active && (
            <Popconfirm
              title="Деактивировать позицию?"
              okText="Да"
              cancelText="Нет"
              onConfirm={() => remove.mutate(row.menu_item_id)}
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
        <Space wrap>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Поиск по названию"
            style={{ width: 240 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            style={{ width: 160 }}
            value={activeFilter}
            onChange={(v) => {
              setActiveFilter(v);
              reset();
            }}
            options={[
              { value: "all", label: "Все позиции" },
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
        rowKey="menu_item_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        pagination={tablePagination(query.data?.total)}
        columns={columns}
        onChange={onTableChange}
      />
      <Modal
        title={editing ? "Изменить позицию меню" : "Новая позиция меню"}
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
          <Form.Item
            name="product_id"
            label="Продукт (списание со склада)"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              loading={products.isPending}
              options={products.data?.items.map((p) => ({ value: p.product_id, label: p.name }))}
            />
          </Form.Item>
          <Form.Item
            name="unit_id"
            label="Единица измерения порции"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              loading={units.isPending}
              options={units.data?.items.map((u) => ({ value: u.unit_id, label: u.name }))}
            />
          </Form.Item>
          <Form.Item
            name="portion_qty"
            label="Количество на порцию"
            initialValue={1}
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <InputNumber min={0.000001} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="sale_price"
            label="Базовая цена продажи"
            tooltip="Цена «Основного меню»; остальные прайс-листы задают только отличия"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <InputNumber min={0.01} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="category" label="Категория">
            <Input maxLength={256} />
          </Form.Item>
          <Form.Item
            label="Фото"
            tooltip="Показывается клиентам на сайте заказа. Файл уходит на бэкенд, а он
                     кладёт его в облачное хранилище — прямой ссылки на бакет нет.
                     jpeg, png или webp, размер не ограничен. Без фото на сайте
                     будет заглушка."
          >
            <MenuItemPhoto
              // У новой позиции id ещё нет — файл ждёт до её создания.
              itemId={editing?.menu_item_id ?? null}
              url={editing?.image_url ?? null}
              pendingFile={pendingFile}
              uploading={uploadImage.isPending}
              removing={removeImage.isPending}
              onPick={(file) => {
                if (editing) uploadImage.mutate({ id: editing.menu_item_id, file });
                else setPendingFile(file);
              }}
              onRemove={() => {
                if (editing?.image_url) removeImage.mutate(editing.menu_item_id);
                else setPendingFile(null);
              }}
              onError={(text) => message.error(text)}
            />
          </Form.Item>
          {/* Ссылка остаётся полем: у части позиций фото лежит на чужом хостинге,
              и отбирать эту возможность вместе с появлением загрузки незачем. */}
          <Form.Item
            name="image_url"
            label="Или ссылка на фото"
            rules={[{ type: "url", message: "Нужна ссылка вида https://…" }]}
          >
            <Input maxLength={1024} placeholder="https://…" allowClear />
          </Form.Item>
          {editing && (
            <Form.Item name="is_active" label="Активна" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <NutritionModal
        target={nutritionOf ? { kind: "menu-item", id: nutritionOf.menu_item_id } : null}
        title={nutritionOf?.name ?? ""}
        onClose={() => setNutritionOf(null)}
      />
    </div>
  );
}

/** Что разрешает бэкенд (см. app/media/storage.py). Проверяем и здесь, чтобы не
 *  гнать на сервер файл, который он всё равно отвергнет. Ограничения на РАЗМЕР
 *  нет ни там, ни тут: снимок с телефона это спокойно 15–20 МБ. */
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Фото позиции: превью, выбор файла, удаление.
 *
 * У новой позиции id ещё нет, поэтому файл не отправляется сразу, а показывается
 * превью из локального blob и ждёт создания карточки. У существующей — уходит
 * сразу: файл уже выбран, держать его в подвешенном состоянии незачем. */
function MenuItemPhoto({
  itemId,
  url,
  pendingFile,
  uploading,
  removing,
  onPick,
  onRemove,
  onError,
}: {
  itemId: number | null;
  url: string | null;
  pendingFile: File | null;
  uploading: boolean;
  removing: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
  onError: (text: string) => void;
}) {
  // Локальное превью для ещё не отправленного файла; отзываем URL, чтобы не
  // течь памятью при переборе картинок.
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!pendingFile) {
      setPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(pendingFile);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [pendingFile]);

  const src = preview ?? mediaSrc(url);

  function pick(file: File): boolean {
    if (!ALLOWED_TYPES.includes(file.type)) {
      onError("Только jpeg, png или webp");
      return false;
    }
    onPick(file);
    return false; // загрузку делаем сами; antd не должен ничего отправлять
  }

  return (
    <Space align="start" size={12}>
      {src ? (
        <img
          src={src}
          alt="Фото позиции"
          style={{
            width: 96, height: 96, objectFit: "cover", borderRadius: 8,
            border: "1px solid #f0f0f0",
          }}
        />
      ) : (
        <div
          style={{
            width: 96, height: 96, borderRadius: 8, border: "1px dashed #d9d9d9",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#bfbfbf", fontSize: 24,
          }}
        >
          <PictureOutlined />
        </div>
      )}
      <Space direction="vertical" size={6}>
        <Upload accept={ALLOWED_TYPES.join(",")} showUploadList={false} beforeUpload={pick}>
          <Button icon={<UploadOutlined />} loading={uploading}>
            {src ? "Заменить" : "Загрузить фото"}
          </Button>
        </Upload>
        {(url || pendingFile) && (
          <Button
            danger
            type="text"
            size="small"
            loading={removing}
            onClick={onRemove}
          >
            Убрать
          </Button>
        )}
        {itemId == null && pendingFile && (
          <span style={{ color: "#8c8c8c", fontSize: 12 }}>
            загрузится после сохранения
          </span>
        )}
      </Space>
    </Space>
  );
}
