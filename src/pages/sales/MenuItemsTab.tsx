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
  App, Alert, Button, Descriptions, Form, Input, InputNumber, Popconfirm, Select, Space, Spin,
  Switch, Table, Tag, Upload,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage, mediaSrc } from "@/api/client";
import {
  createMenuItem,
  deleteMenuItem,
  deleteMenuItemImage,
  getMenuItemNutrition,
  listMenuItems,
  listProductsLookup,
  listUnitsLookup,
  updateMenuItem,
  uploadMenuItemImage,
  type MenuItemCreate,
  type MenuItemNutritionOut,
  type MenuItemOut,
} from "@/api/sales";
import { useCan } from "@/auth/store";
import EntityCardDrawer from "@/components/EntityCardDrawer";
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
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive" | "stopped">("active");
  const active = activeFilter === "all" || activeFilter === "stopped"
    ? undefined
    : activeFilter === "active";
  const stopped = activeFilter === "stopped" ? true : undefined;
  const [editing, setEditing] = useState<MenuItemOut | null>(null);
  const [open, setOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  /** Фото, выбранное для ЕЩЁ НЕ созданной позиции: загрузка требует id, поэтому
   *  файл ждёт здесь и уходит сразу после создания. */
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [form] = Form.useForm();

  const query = useQuery({
    queryKey: ["menu-items", { limit, offset, active, stopped, searchParam, sort }],
    queryFn: () =>
      listMenuItems({
        limit, offset, active, stopped, search: searchParam, sort, with_cost: true,
      }),
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
    onSuccess: (row) => {
      message.success(editing ? "Сохранено" : "Позиция создана");
      setPendingFile(null);
      setEditing(row);
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["nutrition", "menu-item", row.menu_item_id] });
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
      closeCard();
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const toggleStop = useMutation({
    mutationFn: ({ id, is_stopped }: { id: number; is_stopped: boolean }) =>
      updateMenuItem(id, { is_stopped }),
    onSuccess: (row, { is_stopped }) => {
      message.success(is_stopped ? "Позиция на стопе" : "Стоп снят");
      setEditing((cur) =>
        cur && cur.menu_item_id === row.menu_item_id ? row : cur,
      );
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openCreate() {
    setEditing(null);
    setPendingFile(null);
    form.resetFields();
    setIsEditing(true);
    setOpen(true);
  }

  function fillForm(row: MenuItemOut) {
    form.setFieldsValue({
      ...row,
      portion_qty: Number(row.portion_qty),
      sale_price: Number(row.sale_price),
    });
  }

  function openCard(row: MenuItemOut) {
    setEditing(row);
    setPendingFile(null);
    fillForm(row);
    setIsEditing(false);
    setOpen(true);
  }

  function closeCard() {
    setOpen(false);
    setIsEditing(false);
    setEditing(null);
    setPendingFile(null);
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
      title: "Себестоимость",
      dataIndex: "portion_cost",
      align: "right",
      width: 140,
      render: (v: string | null | undefined, row) => {
        if (v == null) return <span style={{ color: "#bfbfbf" }}>—</span>;
        return (
          <Space size={4}>
            <Money value={v} />
            {row.portion_cost_missing && (
              <Tag color="warning" style={{ marginInlineEnd: 0 }}>неполная</Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: "Статус",
      dataIndex: "is_active",
      width: 130,
      render: (_v: boolean, row) => {
        if (row.is_stopped) return <Tag color="red">Стоп</Tag>;
        return row.is_active ? <Tag color="green">Активна</Tag> : <Tag>Неактивна</Tag>;
      },
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
              { value: "stopped", label: "На стопе" },
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
        rowClassName={(row) =>
          `row-clickable${row.is_stopped ? " menu-item-stopped" : ""}`
        }
        onRow={(row) => ({
          onClick: () => openCard(row),
        })}
      />
      <style>{`
        .menu-item-stopped td { background: #fff2f0; }
      `}</style>
      <EntityCardDrawer
        open={open}
        onClose={closeCard}
        title={editing?.name ?? "Новая позиция меню"}
        width={560}
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
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <Descriptions column={1} bordered size="small">
                <Descriptions.Item label="Название">{editing.name}</Descriptions.Item>
                <Descriptions.Item label="Категория">{editing.category ?? "—"}</Descriptions.Item>
                <Descriptions.Item label="Продукт">{productName(editing.product_id)}</Descriptions.Item>
                <Descriptions.Item label="Порция">
                  {fmtQty(editing.portion_qty)} {unitName(editing.unit_id)}
                </Descriptions.Item>
                <Descriptions.Item label="Базовая цена">
                  <Money value={editing.sale_price} />
                </Descriptions.Item>
                <Descriptions.Item label="Статус">
                  {editing.is_stopped ? (
                    <Tag color="red">Стоп</Tag>
                  ) : editing.is_active ? (
                    <Tag color="green">Активна</Tag>
                  ) : (
                    <Tag>Неактивна</Tag>
                  )}
                </Descriptions.Item>
              </Descriptions>
              <MenuItemNutrition itemId={editing.menu_item_id} />
              <Space wrap>
                {canManage && editing.is_active && !editing.is_stopped && (
                  <Popconfirm
                    title={`Поставить «${editing.name}» на стоп?`}
                    description="Позиция пропадёт из кассы и клиентского меню, пока стоп не снимете."
                    okText="На стоп"
                    cancelText="Отмена"
                    okButtonProps={{ danger: true }}
                    onConfirm={() =>
                      toggleStop.mutate({ id: editing.menu_item_id, is_stopped: true })
                    }
                  >
                    <Button danger loading={toggleStop.isPending}>На стоп</Button>
                  </Popconfirm>
                )}
                {canManage && editing.is_stopped && (
                  <Popconfirm
                    title={`Снять «${editing.name}» со стопа?`}
                    description="Позиция снова появится в кассе и у клиентов."
                    okText="Снять стоп"
                    cancelText="Отмена"
                    onConfirm={() =>
                      toggleStop.mutate({ id: editing.menu_item_id, is_stopped: false })
                    }
                  >
                    <Button loading={toggleStop.isPending}>Снять стоп</Button>
                  </Popconfirm>
                )}
                {canManage && editing.is_active && (
                  <Popconfirm
                    title="Деактивировать позицию?"
                    okText="Да"
                    cancelText="Нет"
                    onConfirm={() => remove.mutate(editing.menu_item_id)}
                  >
                    <Button danger loading={remove.isPending}>Деактивировать</Button>
                  </Popconfirm>
                )}
              </Space>
            </Space>
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
        }
      />
    </div>
  );
}

function NutriGrid({
  value,
}: {
  value: MenuItemNutritionOut["per_portion"] | null;
}) {
  if (!value) return null;
  return (
    <div className="nutri-grid">
      <div className="nutri-cell">
        <strong>{fmtQty(value.energy_kcal)}</strong>
        <span>ккал</span>
      </div>
      <div className="nutri-cell">
        <strong>{fmtQty(value.protein)}</strong>
        <span>белки</span>
      </div>
      <div className="nutri-cell">
        <strong>{fmtQty(value.fat)}</strong>
        <span>жиры</span>
      </div>
      <div className="nutri-cell">
        <strong>{fmtQty(value.carbs)}</strong>
        <span>углеводы</span>
      </div>
    </div>
  );
}

/** КБЖУ порции сразу в карточке: без второй модалки поверх ящика. */
function MenuItemNutrition({ itemId }: { itemId: number }) {
  const query = useQuery({
    queryKey: ["nutrition", "menu-item", itemId],
    queryFn: () => getMenuItemNutrition(itemId),
  });
  const data = query.data;
  const note: CSSProperties = { color: "#8c8c8c", fontSize: 12, margin: 0 };

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <div style={{ fontWeight: 600 }}>КБЖУ</div>
      {query.isPending && <Spin size="small" />}
      {query.isError && (
        <Alert type="error" showIcon message={errorMessage(query.error)} />
      )}
      {data && (
        <>
          {!data.complete && (
            <Alert
              type="warning"
              showIcon
              message="Данные неполные — значения занижены"
              description={
                data.missing_product_names.length > 0
                  ? `Не заполнено КБЖУ или вес единицы: ${data.missing_product_names.join(", ")}`
                  : "У части компонентов не заполнено КБЖУ."
              }
            />
          )}
          {data.per_100g ? (
            <>
              <p style={note}>На 100 г</p>
              <NutriGrid value={data.per_100g} />
            </>
          ) : (
            <p style={note}>На 100 г неизвестно: нет веса порции</p>
          )}
          <p style={note}>На порцию</p>
          <NutriGrid value={data.per_portion} />
          <div>
            {data.portion_weight_kg ? (
              <Tag>
                Вес порции: {(Number(data.portion_weight_kg) * 1000).toFixed(0)} г
              </Tag>
            ) : (
              <Tag color="orange">Вес не задан — «на 100 г» посчитать нечем</Tag>
            )}
            {data.source === "own" ? (
              <Tag color="blue">указано в карточке</Tag>
            ) : (
              data.complete && <Tag color="green">по тех-карте</Tag>
            )}
          </div>
        </>
      )}
    </Space>
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
