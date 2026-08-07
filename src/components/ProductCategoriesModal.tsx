/** Справочник категорий товара: создать, переименовать, переставить, удалить.
 *
 *  Живёт отдельным окном и открывается из двух мест — из каталога продуктов и из
 *  ABC-отчёта. Категории заводят как раз тогда, когда смотрят отчёт и видят, что
 *  разрез бесполезен («Кулинария» и «Кондитерка» на восемьсот позиций), поэтому
 *  гонять человека в другой раздел за созданием категории — лишний шаг.
 *
 *  Два предупреждения в интерфейсе неслучайны: переименование тянет за собой все
 *  товары категории, а удаление снимает категорию с товаров (сами товары
 *  остаются). И то и другое затрагивает не одну строку, поэтому счётчик товаров
 *  показан рядом с каждой категорией. */
import { PlusOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Form,
  Input,
  InputNumber,
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
  createProductCategory,
  deleteProductCategory,
  listProductCategories,
  updateProductCategory,
  type ProductCategoryOut,
} from "@/api/catalog";
import { useCan } from "@/auth/store";

/** Ключ запроса справочника — один на всё приложение, чтобы правка доезжала до
 *  каждого списка и фильтра. */
export const PRODUCT_CATEGORIES_KEY = ["product-categories"];

/** Справочник для выпадающих списков. Меняется редко — минуту держим как свежий. */
export function useProductCategories() {
  return useQuery({
    queryKey: PRODUCT_CATEGORIES_KEY,
    queryFn: listProductCategories,
    staleTime: 60_000,
  });
}

interface CategoryForm {
  name: string;
  sort_order?: number;
  note?: string;
}

export default function ProductCategoriesModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("catalog.manage");
  const [editing, setEditing] = useState<ProductCategoryOut | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form] = Form.useForm<CategoryForm>();

  const query = useProductCategories();

  /** Категория поменялась — обновляем и справочник, и всё, что от него зависит:
   *  список товаров, кэш каталога и отчёты, в которых категория есть разрезом. */
  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: PRODUCT_CATEGORIES_KEY });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["lookup", "products"] });
    queryClient.invalidateQueries({ queryKey: ["abc"] });
    queryClient.invalidateQueries({ queryKey: ["sales-by-product"] });
  }

  const save = useMutation({
    mutationFn: (values: CategoryForm) => {
      const body = {
        name: values.name.trim(),
        sort_order: values.sort_order ?? 0,
        note: values.note?.trim() || null,
      };
      return editing
        ? updateProductCategory(editing.product_category_id, body)
        : createProductCategory(body);
    },
    onSuccess: (category) => {
      message.success(editing ? `Категория «${category.name}» сохранена` : "Создано");
      setFormOpen(false);
      invalidateAll();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (row: ProductCategoryOut) =>
      deleteProductCategory(row.product_category_id),
    onSuccess: (category) => {
      message.success(`Категория «${category.name}» удалена`);
      invalidateAll();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(row: ProductCategoryOut) {
    setEditing(row);
    setFormOpen(true);
  }

  /** Значения задаются `initialValues`, а не `setFieldsValue` до открытия окна:
   *  с `destroyOnHidden` форма создаётся заново на каждое открытие, и до него её
   *  ещё нет (antd на это и жалуется: «useForm is not connected to any Form
   *  element»). Состояние `editing` выставляется раньше, поэтому здесь уже видно,
   *  правим мы категорию или создаём новую. */
  const initialValues = editing
    ? {
        name: editing.name,
        sort_order: editing.sort_order,
        note: editing.note ?? undefined,
      }
    : { name: "", sort_order: 0, note: undefined };

  const columns: ColumnsType<ProductCategoryOut> = [
    { title: "Категория", dataIndex: "name" },
    {
      title: "Товаров",
      dataIndex: "product_count",
      width: 100,
      align: "right",
      render: (n: number) =>
        n > 0 ? n : <Tag style={{ marginInlineEnd: 0 }}>пусто</Tag>,
    },
    {
      title: "Порядок",
      dataIndex: "sort_order",
      width: 90,
      align: "right",
    },
    {
      title: "",
      width: 170,
      render: (_, row) =>
        canManage && (
          <Space size="middle">
            <a onClick={() => openEdit(row)}>Изменить</a>
            <Popconfirm
              title="Удалить категорию?"
              description={
                row.product_count > 0
                  ? `У ${row.product_count} товаров категория будет снята. Сами товары останутся.`
                  : "Категория пустая — товары не затронуты."
              }
              okText="Да"
              cancelText="Нет"
              onConfirm={() => remove.mutate(row)}
            >
              <a>Удалить</a>
            </Popconfirm>
          </Space>
        ),
    },
  ];

  return (
    <>
      <Modal
        title="Категории товара"
        open={open}
        onCancel={onClose}
        footer={null}
        width={680}
      >
        {canManage && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            style={{ marginBottom: 12 }}
            onClick={openCreate}
          >
            Новая категория
          </Button>
        )}
        <Table<ProductCategoryOut>
          rowKey="product_category_id"
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
            extra={
              editing && editing.product_count > 0
                ? `Переименование поменяет категорию у ${editing.product_count} товаров.`
                : undefined
            }
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Input maxLength={256} />
          </Form.Item>
          <Form.Item
            name="sort_order"
            label="Порядок в списках"
            tooltip="Меньше — выше; при равенстве порядок по названию"
          >
            <InputNumber min={-9999} max={9999} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="note" label="Примечание">
            <Input.TextArea rows={2} maxLength={1000} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
