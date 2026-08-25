import { PlusOutlined, SearchOutlined, TagsOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  AutoComplete,
  Button,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";

import { useListControls } from "@/components/useListControls";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  createProduct,
  deleteProduct,
  listProductGroups,
  updateProduct,
  listProducts,
  type ItemType,
  type ProductKind,
  type ProductOut,
} from "@/api/catalog";
import { useCan } from "@/auth/store";
import AssignCategoryModal from "@/components/AssignCategoryModal";
import ProductCategoriesModal, {
  useProductCategories,
} from "@/components/ProductCategoriesModal";
import { Money, fmtDate, fmtQty } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import {
  ITEM_TYPE_COLORS,
  ITEM_TYPE_HINTS,
  ITEM_TYPE_LABELS,
  ITEM_TYPE_OPTIONS,
  PRODUCT_KIND_COLORS,
  PRODUCT_KIND_LABELS,
  PRODUCT_KIND_OPTIONS,
} from "@/pages/catalog/labels";
import ProductCardDrawer from "@/pages/catalog/ProductCardDrawer";
import { useUnitOptions } from "@/pages/catalog/useCatalogOptions";

interface ProductFormValues {
  name: string;
  kind: ProductKind;
  item_type: ItemType;
  base_unit_id: number;
  sku?: string;
  category?: string;
  // КБЖУ на 100 г и вес единицы — как в карточке товара iiko.
  energy_kcal_100g?: number;
  protein_100g?: number;
  fat_100g?: number;
  carbs_100g?: number;
  unit_weight_kg?: number;
}

/** Пункт «без категории» в фильтре: сервер ждёт для него пустую строку, а пустая
 *  строка как значение выпадающего списка неотличима от «ничего не выбрано». */
const NO_CATEGORY_KEY = "__none__";

/** Пустое поле формы -> null (стереть значение), число -> строка для Decimal. */
const num = (v: number | undefined) => (v == null ? null : String(v));
const numOrUndef = (v: string | null | undefined) =>
  v == null ? undefined : Number(v);

export default function ProductsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("catalog.manage");
  const { limit, offset, tablePagination, reset } = usePagination();
  const units = useUnitOptions();

  const { search, setSearch, searchParam, sort, onTableChange } =
    useListControls<ProductOut>({ onReset: reset });
  const [kind, setKind] = useState<ProductKind | undefined>(undefined);
  const [includeInactive, setIncludeInactive] = useState(false);
  /** «Заполнено / не заполнено КБЖУ» — по нему находят, что осталось завести. */
  const [nutritionFilter, setNutritionFilter] = useState<"filled" | "missing" | undefined>();
  const [itemType, setItemType] = useState<ItemType | undefined>();
  const [group, setGroup] = useState<string | undefined>();
  /** Отбор по категории; `NO_CATEGORY_KEY` — «без категории» (сервер ждёт для этого
   *  пустую строку, но она в выпадающем списке неотличима от «не выбрано»). */
  const [categoryKey, setCategoryKey] = useState<string | undefined>();
  const category = categoryKey === NO_CATEGORY_KEY ? "" : categoryKey;
  const [editing, setEditing] = useState<ProductOut | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  /** Выделенные товары — их переносят в категорию пачкой. */
  const [selected, setSelected] = useState<number[]>([]);
  /** Товар, чья карточка открыта. Подробности живут в ней, а не в колонках:
   *  реквизитов, себестоимости, состава, КБЖУ и остатков в таблицу не влезает. */
  const [cardId, setCardId] = useState<number | null>(null);
  const [form] = Form.useForm<ProductFormValues>();

  const categories = useProductCategories();

  const query = useQuery({
    queryKey: [
      "products",
      {
        limit, offset, kind, includeInactive, searchParam, sort,
        nutritionFilter, itemType, group, category,
      },
    ],
    queryFn: () =>
      listProducts({
        limit, offset, kind, include_inactive: includeInactive,
        search: searchParam, sort, nutrition: nutritionFilter,
        item_type: itemType, group, category,
        // Единственное место, где себестоимость нужна в списке; справочникам
        // она ни к чему, и по умолчанию сервер её не считает.
        with_cost: true,
      }),
  });

  const groups = useQuery({
    queryKey: ["product-groups"],
    queryFn: listProductGroups,
    staleTime: 300_000,
  });

  const save = useMutation({
    mutationFn: (values: ProductFormValues) => {
      const body = {
        name: values.name,
        kind: values.kind,
        item_type: values.item_type,
        base_unit_id: values.base_unit_id,
        sku: values.sku?.trim() || null,
        category: values.category?.trim() || null,
        // Пустое поле шлём как null: «не заполнено» и «ноль калорий» — разные
        // вещи, и вода с нулём должна отличаться от неизвестного сырья.
        energy_kcal_100g: num(values.energy_kcal_100g),
        protein_100g: num(values.protein_100g),
        fat_100g: num(values.fat_100g),
        carbs_100g: num(values.carbs_100g),
        unit_weight_kg: num(values.unit_weight_kg),
      };
      return editing ? updateProduct(editing.product_id, body) : createProduct(body);
    },
    onSuccess: () => {
      message.success(editing ? "Сохранено" : "Создано");
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      // Формы документов и отчёты берут каталог хуком useProductsLookup —
      // у него свой ключ, и без этой строки правка не доезжает до них.
      queryClient.invalidateQueries({ queryKey: ["lookup", "products"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  /** «Без пищевой ценности»: соль, вода, тара и статьи затрат сидят в тех-картах
   *  компонентами, и без ЯВНОГО нуля расчёт блюда навсегда остаётся неполным.
   *  Отдельной галочки не вводим: ноль — это и есть значение. */
  const markZero = useMutation({
    mutationFn: (row: ProductOut) =>
      updateProduct(row.product_id, {
        energy_kcal_100g: "0", protein_100g: "0", fat_100g: "0", carbs_100g: "0",
      }),
    onSuccess: () => {
      message.success("Отмечено: пищевой ценности нет");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["lookup", "products"] });
      queryClient.invalidateQueries({ queryKey: ["nutrition"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteProduct(id),
    onSuccess: () => {
      message.success("Продукт деактивирован");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      // Формы документов и отчёты берут каталог хуком useProductsLookup —
      // у него свой ключ, и без этой строки правка не доезжает до них.
      queryClient.invalidateQueries({ queryKey: ["lookup", "products"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openCreate() {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  }
  function openEdit(row: ProductOut) {
    setEditing(row);
    form.setFieldsValue({
      name: row.name,
      kind: row.kind,
      item_type: row.item_type,
      base_unit_id: row.base_unit_id,
      sku: row.sku ?? undefined,
      category: row.category ?? undefined,
      energy_kcal_100g: numOrUndef(row.energy_kcal_100g),
      protein_100g: numOrUndef(row.protein_100g),
      fat_100g: numOrUndef(row.fat_100g),
      carbs_100g: numOrUndef(row.carbs_100g),
      unit_weight_kg: numOrUndef(row.unit_weight_kg),
    });
    setModalOpen(true);
  }

  /** Себестоимость строки: что показать и чем это подписать.
   *
   *  Три источника, и подменять один другим молча нельзя — они отвечают на
   *  разное:
   *
   *  1. средняя по остатку — факт: столько заплачено за то, что лежит. Живёт,
   *     только пока остаток положителен;
   *  2. себестоимость по тех-карте — для блюд и полуфабрикатов: своей цены у них
   *     нет, они стоят столько, сколько состав. Считается сервером на всю
   *     страницу разом, а не по строке: обход дерева рецептов на каждую строку
   *     превратил бы список в минуту ожидания;
   *  3. цена последнего прихода — остаётся, когда сырьё кончилось. Без неё
   *     закончившийся товар выглядел бы бесплатным.
   *
   *  Порядок именно такой: средняя первой, потому что по ней списывают в
   *  себестоимость, — это цифра учёта, а не оценка. */
  function costCell(row: ProductOut) {
    const unit = units.nameOf(row.base_unit_id);
    const avg = row.avg_cost != null ? Number(row.avg_cost) : null;
    const recipe = row.recipe_cost != null ? Number(row.recipe_cost) : null;
    const last = row.last_cost_price != null ? Number(row.last_cost_price) : null;

    if (avg != null && avg > 0) {
      return (
        <Tooltip title={`Средняя по остатку, за 1 ${unit}`}>
          <span>
            <Money value={row.avg_cost} />
          </span>
        </Tooltip>
      );
    }
    if (recipe != null) {
      return (
        <Tooltip
          title={
            (row.recipe_cost_missing
              ? "У части компонентов нет цены — итог занижен. "
              : "") + `По тех-карте, за 1 ${unit}`
          }
        >
          <Space size={4}>
            <Money value={row.recipe_cost} />
            <Tag
              color={row.recipe_cost_missing ? "warning" : undefined}
              style={{ marginInlineEnd: 0 }}
            >
              {row.recipe_cost_missing ? "неполная" : "тех-карта"}
            </Tag>
          </Space>
        </Tooltip>
      );
    }
    if (last != null && last > 0) {
      return (
        <Tooltip
          title={
            "Средней нет (остатка нет), это цена последнего прихода" +
            (row.last_cost_at ? ` от ${fmtDate(row.last_cost_at)}` : "")
          }
        >
          <Space size={4}>
            <Money value={row.last_cost_price} />
            <Tag style={{ marginInlineEnd: 0 }}>приход</Tag>
          </Space>
        </Tooltip>
      );
    }
    if (row.kind !== "ingredient") {
      return (
        <Tooltip title="Нет действующей тех-карты — считать себестоимость не по чему">
          <Tag color="warning" style={{ marginInlineEnd: 0 }}>
            нет тех-карты
          </Tag>
        </Tooltip>
      );
    }
    return (
      <Tooltip title="Ни остатка, ни цены прихода: товар ещё не покупали">
        <span style={{ color: "#bfbfbf" }}>—</span>
      </Tooltip>
    );
  }

  const columns: ColumnsType<ProductOut> = [
    {
      // Название ведёт в карточку: там реквизиты, себестоимость, состав, КБЖУ и
      // остатки. Артикул и категория — второй строкой: они нужны для узнавания,
      // но отдельных колонок не заслуживают.
      title: "Товар",
      dataIndex: "name",
      sorter: true,
      render: (v: string, row) => (
        <Space direction="vertical" size={0}>
          <a onClick={() => setCardId(row.product_id)} style={{ fontWeight: 500 }}>
            {v}
          </a>
          {(row.sku || row.category) && (
            <span style={{ color: "#8c8c8c", fontSize: 12 }}>
              {[row.sku, row.category].filter(Boolean).join(" · ")}
            </span>
          )}
        </Space>
      ),
    },
    {
      // Две оси в одной колонке: `kind` — как товар появляется, `item_type` — что
      // это по сути. Порознь они занимали две колонки и ничего не добавляли.
      title: "Тип",
      dataIndex: "kind",
      width: 190,
      sorter: true,
      render: (k: ProductKind, row) => (
        <Space size={4} wrap>
          <Tag color={PRODUCT_KIND_COLORS[k]} style={{ marginInlineEnd: 0 }}>
            {PRODUCT_KIND_LABELS[k]}
          </Tag>
          <Tooltip title={ITEM_TYPE_HINTS[row.item_type]}>
            <Tag color={ITEM_TYPE_COLORS[row.item_type]} style={{ marginInlineEnd: 0 }}>
              {ITEM_TYPE_LABELS[row.item_type]}
            </Tag>
          </Tooltip>
        </Space>
      ),
    },
    {
      title: "Себестоимость",
      key: "cost",
      width: 170,
      align: "right",
      render: (_, row) => costCell(row),
    },
    {
      title: "Остаток",
      key: "stock",
      width: 150,
      align: "right",
      render: (_, row) => {
        const qty = row.stock_quantity != null ? Number(row.stock_quantity) : null;
        if (qty == null) return <span style={{ color: "#bfbfbf" }}>—</span>;
        return (
          <Space size={4}>
            <span style={{ color: qty < 0 ? "#cf1322" : undefined }}>
              {fmtQty(row.stock_quantity)}
            </span>
            <span style={{ color: "#8c8c8c", fontSize: 12 }}>
              {units.nameOf(row.base_unit_id)}
            </span>
          </Space>
        );
      },
    },
    {
      // Столбец показывает СВОЁ значение карточки. У блюд его обычно нет — и это
      // норма: их КБЖУ считается по тех-карте, карточка покажет результат.
      title: "КБЖУ",
      key: "nutrition",
      width: 150,
      render: (_, row) =>
        row.energy_kcal_100g != null ? (
          <Tooltip
            title={`Б ${row.protein_100g ?? "—"} / Ж ${row.fat_100g ?? "—"} / У ${row.carbs_100g ?? "—"} на 100 г`}
          >
            <Tag color="green">{Number(row.energy_kcal_100g).toFixed(0)} ккал</Tag>
          </Tooltip>
        ) : row.item_type !== "food" ? (
          <Tooltip title="У упаковки, хозтоваров и услуг пищевой ценности нет — расчёт блюд это учитывает">
            <Tag>не требуется</Tag>
          </Tooltip>
        ) : row.kind === "ingredient" ? (
          <Space size={4}>
            <Tag color="orange" style={{ marginInlineEnd: 0 }}>
              не заполнено
            </Tag>
            {canManage && (
              <Tooltip title="Тара, вода, соль, статья затрат — проставить нули, чтобы расчёт блюд стал полным">
                <a style={{ fontSize: 12 }} onClick={() => markZero.mutate(row)}>
                  нет КБЖУ
                </a>
              </Tooltip>
            )}
          </Space>
        ) : (
          <Tooltip title="Считается по тех-карте из сырья">
            <Tag>по тех-карте</Tag>
          </Tooltip>
        ),
    },
    {
      title: "",
      width: 150,
      render: (_, row) => (
        <Space size="middle">
          <a onClick={() => setCardId(row.product_id)}>Подробнее</a>
          {canManage && row.is_active && (
            <Popconfirm
              title="Деактивировать продукт?"
              description="Он будет скрыт из списка (мягкое удаление)."
              okText="Да"
              cancelText="Нет"
              onConfirm={() => remove.mutate(row.product_id)}
            >
              <a>Удалить</a>
            </Popconfirm>
          )}
          {!row.is_active && <Tag>неактивен</Tag>}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space
        style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}
      >
        <h2 style={{ margin: 0 }}>Продукты</h2>
        <Space>
          <Button icon={<TagsOutlined />} onClick={() => setCategoriesOpen(true)}>
            Категории
          </Button>
          {canManage && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Добавить
            </Button>
          )}
        </Space>
      </Space>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Поиск по названию или артикулу"
          style={{ width: 280 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          allowClear
          placeholder="Тип"
          style={{ width: 200 }}
          value={kind}
          options={PRODUCT_KIND_OPTIONS}
          onChange={(v) => {
            setKind(v);
            reset();
          }}
        />
        <Select
          allowClear
          placeholder="Вид"
          style={{ width: 170 }}
          value={itemType}
          options={ITEM_TYPE_OPTIONS}
          onChange={(v) => {
            setItemType(v);
            reset();
          }}
        />
        <Select
          allowClear
          showSearch
          placeholder="Группа"
          style={{ width: 200 }}
          value={group}
          loading={groups.isPending}
          options={(groups.data ?? []).map((g) => ({ value: g, label: g }))}
          onChange={(v) => {
            setGroup(v);
            reset();
          }}
        />
        {/* «Без категории» — главный рабочий отбор: из iiko приехали сотни позиций
            без категории, и раскладывать их надо именно из этого списка. */}
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Категория"
          style={{ width: 220 }}
          value={categoryKey}
          loading={categories.isPending}
          options={[
            { value: NO_CATEGORY_KEY, label: "Без категории" },
            ...(categories.data ?? []).map((c) => ({
              value: c.name,
              label: `${c.name} (${c.product_count})`,
            })),
          ]}
          onChange={(v) => {
            setCategoryKey(v);
            setSelected([]);
            reset();
          }}
        />
        {/* Главный рабочий фильтр по КБЖУ: «что осталось завести». Считается на
            сервере — список постраничный, и фильтрация в браузере врала бы.
            `missing` возвращает только еду: у прочего заполнять нечего. */}
        <Select
          allowClear
          placeholder="КБЖУ: все"
          style={{ width: 200 }}
          value={nutritionFilter}
          onChange={(v) => {
            setNutritionFilter(v);
            reset();
          }}
          options={[
            { value: "missing", label: "КБЖУ не заполнено" },
            { value: "filled", label: "КБЖУ заполнено" },
          ]}
        />
        <Space size="small">
          <Switch
            checked={includeInactive}
            onChange={(v) => {
              setIncludeInactive(v);
              reset();
            }}
          />
          <span>Показывать неактивные</span>
        </Space>
      </Space>

      {selected.length > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message={`Выбрано товаров: ${selected.length}`}
          action={
            <Space>
              <Button size="small" type="primary" onClick={() => setAssignOpen(true)}>
                Перенести в категорию
              </Button>
              <Button size="small" onClick={() => setSelected([])}>
                Снять
              </Button>
            </Space>
          }
        />
      )}

      <Table<ProductOut>
        rowKey="product_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        pagination={tablePagination(query.data?.total)}
        columns={columns}
        onChange={onTableChange}
        // Строка открывает карточку целиком: попадать в ссылку названия мышью
        // приходится точнее, чем нужно. Выделение и ссылки внутри строки клик не
        // перехватывают — antd отдаёт им событие первыми.
        //
        // `row-product`, а не общий `row-clickable`: под курсором жёлтая заливка
        // (см. index.css) — она отбивает строку товара от соседних, а в списке
        // на страницу позиций это главное, чего не хватало.
        rowClassName={() => "row-product"}
        onRow={(row) => ({
          onClick: () => setCardId(row.product_id),
        })}
        rowSelection={
          canManage
            ? {
                selectedRowKeys: selected,
                onChange: (keys) => setSelected(keys.map((k) => Number(k))),
                // Список постраничный: без этого выделение на первой странице
                // терялось бы при переходе на вторую.
                preserveSelectedRowKeys: true,
              }
            : undefined
        }
      />

      <Modal
        title={editing ? "Изменить продукт" : "Новый продукт"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={save.isPending}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => save.mutate(v)}
        >
          <Form.Item
            name="name"
            label="Название"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Input maxLength={256} />
          </Form.Item>
          <Form.Item
            name="kind"
            label="Тип"
            rules={[{ required: true, message: "Выберите тип" }]}
          >
            <Select options={PRODUCT_KIND_OPTIONS} placeholder="Тип продукта" />
          </Form.Item>
          <Form.Item
            name="item_type"
            label="Вид номенклатуры"
            initialValue="food"
            tooltip="Еда участвует в КБЖУ и в меню; упаковка и хозтовары только в складе; услуга — статья затрат, на складе ей места нет"
            rules={[{ required: true, message: "Выберите вид" }]}
          >
            <Select options={ITEM_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="base_unit_id"
            label="Базовая единица"
            rules={[{ required: true, message: "Выберите единицу" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              loading={units.isLoading}
              options={units.options}
              placeholder="Единица измерения"
            />
          </Form.Item>
          <Form.Item name="sku" label="Артикул">
            <Input maxLength={128} />
          </Form.Item>
          {/* Подсказываем заведённые категории, но не запрещаем новую: карточка
              товара — законное место, где категория появляется впервые. Справочник
              подхватит её при следующем открытии окна категорий. */}
          <Form.Item name="category" label="Категория">
            <AutoComplete
              allowClear
              filterOption={(input, option) =>
                String(option?.value ?? "").toLowerCase().includes(input.toLowerCase())
              }
              options={(categories.data ?? []).map((c) => ({ value: c.name }))}
            >
              <Input maxLength={256} placeholder="Выберите или введите новую" />
            </AutoComplete>
          </Form.Item>

          <Divider orientation="left" plain style={{ marginTop: 8 }}>
            Пищевая ценность на 100 г
          </Divider>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="Заполняется у сырья"
            description="У полуфабрикатов и блюд КБЖУ считается по тех-карте — вводить его здесь не нужно, иначе этикетка разойдётся с рецептом."
          />
          <Row gutter={12}>
            <Col span={6}>
              <Form.Item name="energy_kcal_100g" label="Ккал">
                <InputNumber min={0} max={10000} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="protein_100g" label="Белки, г">
                <InputNumber min={0} max={100} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="fat_100g" label="Жиры, г">
                <InputNumber min={0} max={100} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="carbs_100g" label="Углеводы, г">
                <InputNumber min={0} max={100} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="unit_weight_kg"
            label="Вес одной базовой единицы, кг"
            tooltip="Сколько весит 1 шт / 1 л и т.п. Без него «на 100 г» не посчитать; для товара в килограммах это 1."
          >
            <InputNumber min={0} step={0.001} style={{ width: 240 }} />
          </Form.Item>
        </Form>
      </Modal>

      <ProductCardDrawer
        productId={cardId}
        unitName={(id) => units.nameOf(id)}
        onClose={() => setCardId(null)}
        onEdit={(product) => {
          setCardId(null);
          openEdit(product);
        }}
      />

      <ProductCategoriesModal
        open={categoriesOpen}
        onClose={() => setCategoriesOpen(false)}
      />
      <AssignCategoryModal
        open={assignOpen}
        productIds={selected}
        onClose={() => setAssignOpen(false)}
        onDone={() => setSelected([])}
      />

    </div>
  );
}
