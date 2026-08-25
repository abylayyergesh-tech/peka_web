/** Карточка товара: всё про один продукт в одной панели.
 *
 *  Список товаров отвечает на вопрос «что у нас есть», а карточка — на «что это
 *  такое»: реквизиты, себестоимость, состав, КБЖУ и где лежит. Раньше за этим
 *  приходилось идти на четыре разных экрана (тех-карта, остатки, КБЖУ, правка), и
 *  в списке для них не было даже ссылок.
 *
 *  Состав КЛИКАБЕЛЬНЫЙ: у блюда компоненты — это такие же товары, и «а сколько
 *  стоит эта мука» — следующий вопрос после «сколько стоит блюдо». Нажатие на
 *  компонент открывает его карточку, а путь возврата хранится крошками: спуск по
 *  тех-карте бывает в три уровня, и без них человек теряется.
 *
 *  Тяжёлые расчёты грузятся ТОЛЬКО когда карточка открыта и только для нужного
 *  товара: и себестоимость по тех-карте, и КБЖУ рекурсивны, и в списке из
 *  пятидесяти строк это было бы пятьдесят обходов дерева рецептов. */
import {
  ArrowLeftOutlined,
  EditOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import { getProduct, getProductNutrition, type ProductOut } from "@/api/catalog";
import { getStock, getTechCard, type TechCardRow } from "@/api/reports";
import { Money, fmtDate, fmtQty } from "@/components/format";
import {
  ITEM_TYPE_COLORS,
  ITEM_TYPE_LABELS,
  PRODUCT_KIND_COLORS,
  PRODUCT_KIND_LABELS,
} from "@/pages/catalog/labels";

/** Откуда взялась цена компонента. Формулировки те же, что на экране тех-карты. */
const COST_SOURCE_LABELS: Record<string, string> = {
  stock: "средняя по остатку",
  last_price: "цена последнего прихода",
  service: "статья затрат без ставки",
};

/** Плоский список строк тех-карты: вложенность рисует сама таблица, а нам нужен
 *  подсчёт «сколько всего компонентов». */
function countRows(rows: TechCardRow[]): number {
  return rows.reduce((n, r) => n + 1 + countRows(r.children ?? []), 0);
}

export default function ProductCardDrawer({
  productId,
  unitName,
  onClose,
  onEdit,
}: {
  /** null — панель закрыта. */
  productId: number | null;
  /** Название базовой единицы по id — из справочника вызывающего экрана. */
  unitName: (unitId: number) => string;
  onClose: () => void;
  onEdit?: (product: ProductOut) => void;
}) {
  /** Путь спуска по составу. Последний элемент — то, что показано сейчас. */
  const [trail, setTrail] = useState<number[]>([]);
  const current = trail.length ? trail[trail.length - 1] : productId;

  // Панель открыли на другом товаре — путь начинается заново.
  useEffect(() => {
    setTrail(productId == null ? [] : [productId]);
  }, [productId]);

  const open = productId != null;

  const product = useQuery({
    queryKey: ["product-card", current],
    queryFn: () => getProduct(current as number),
    enabled: open && current != null,
  });

  const isComposite =
    product.data?.kind === "dish" || product.data?.kind === "semi_finished";

  // Тех-карта только у составных: у сырья её нет, и запрос вернул бы 422.
  const techCard = useQuery({
    queryKey: ["product-card-tech", current],
    queryFn: () => getTechCard(current as number),
    enabled: open && current != null && isComposite,
    retry: false,
  });

  const nutrition = useQuery({
    queryKey: ["product-card-nutrition", current],
    queryFn: () => getProductNutrition(current as number),
    enabled: open && current != null,
    retry: false,
  });

  const stock = useQuery({
    queryKey: ["product-card-stock", current],
    queryFn: () => getStock({ product_id: current as number }),
    enabled: open && current != null,
  });

  const onStock = useMemo(
    () => (stock.data ?? []).filter((r) => Number(r.quantity) !== 0),
    [stock.data],
  );

  const composition: ColumnsType<TechCardRow> = [
    {
      title: "Компонент",
      dataIndex: "name",
      render: (v: string, row) => (
        <Space size={6}>
          {/* Ссылка уводит в карточку компонента сама и ГАСИТ всплытие: клик
              обрабатывает ещё и вся строка, и без этого один компонент попадал бы
              в путь дважды — «Назад» пришлось бы нажимать два раза. */}
          <a
            onClick={(e) => {
              e.stopPropagation();
              setTrail((t) => [...t, row.product_id]);
            }}
          >
            {v}
          </a>
          {row.kind === "semi_finished" && (
            <Tag color={PRODUCT_KIND_COLORS.semi_finished}>ПФ</Tag>
          )}
        </Space>
      ),
    },
    {
      title: "Брутто",
      dataIndex: "brutto",
      width: 130,
      align: "right",
      render: (v: string, row) => `${fmtQty(v)} ${row.unit_name}`,
    },
    {
      title: "Цена за ед.",
      dataIndex: "unit_cost",
      width: 140,
      align: "right",
      render: (v: string | null, row) =>
        v == null ? (
          <Tooltip title="Цену взять негде: ни остатка, ни цены прихода">
            <Tag color="warning" style={{ marginInlineEnd: 0 }}>
              нет цены
            </Tag>
          </Tooltip>
        ) : (
          <Tooltip
            title={
              row.cost_source
                ? COST_SOURCE_LABELS[row.cost_source] ?? row.cost_source
                : "по составу полуфабриката"
            }
          >
            <span>
              <Money value={v} />
            </span>
          </Tooltip>
        ),
    },
    {
      title: "Стоимость",
      dataIndex: "cost_total",
      width: 140,
      align: "right",
      render: (v: string | null) =>
        v == null ? <span style={{ color: "#bfbfbf" }}>—</span> : <Money value={v} />,
    },
  ];

  const card = product.data;
  const canGoBack = trail.length > 1;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={720}
      destroyOnHidden
      title={
        <Space size={8} wrap>
          {canGoBack && (
            <Button
              size="small"
              icon={<ArrowLeftOutlined />}
              onClick={() => setTrail((t) => t.slice(0, -1))}
            >
              Назад
            </Button>
          )}
          <span>{card?.name ?? "Карточка товара"}</span>
          {card && (
            <>
              <Tag color={PRODUCT_KIND_COLORS[card.kind]}>
                {PRODUCT_KIND_LABELS[card.kind]}
              </Tag>
              <Tag color={ITEM_TYPE_COLORS[card.item_type]}>
                {ITEM_TYPE_LABELS[card.item_type]}
              </Tag>
              {!card.is_active && <Tag>неактивен</Tag>}
            </>
          )}
        </Space>
      }
      extra={
        card && onEdit ? (
          <Button icon={<EditOutlined />} onClick={() => onEdit(card)}>
            Изменить
          </Button>
        ) : null
      }
    >
      {product.isPending && <Spin />}
      {product.isError && (
        <Alert type="error" showIcon message={errorMessage(product.error)} />
      )}

      {card && (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          {/* ---- себестоимость ---- */}
          <div>
            <Typography.Title level={5}>Себестоимость</Typography.Title>
            <Space size={32} wrap>
              <Statistic
                title="Средняя по остатку"
                valueRender={() => <Money value={card.avg_cost ?? "0"} />}
                value={0}
              />
              <Statistic
                title="Цена последнего прихода"
                valueRender={() => (
                  <Money value={card.last_cost_price ?? null} />
                )}
                value={0}
              />
              {isComposite && (
                <>
                  {/* Два РАЗНЫХ числа, и подписаны они намеренно по-разному: одно
                      за единицу, другое за всю партию по выходу тех-карты. Под
                      общей подписью «по тех-карте» их путали бы. */}
                  <Statistic
                    title={`По тех-карте за 1 ${unitName(card.base_unit_id)}`}
                    valueRender={() =>
                      card.recipe_cost != null ? (
                        <Money value={card.recipe_cost} />
                      ) : (
                        <span style={{ color: "#bfbfbf" }}>—</span>
                      )
                    }
                    value={0}
                  />
                  <Statistic
                    title={
                      techCard.data
                        ? `Партия ${fmtQty(techCard.data.output_quantity)} ${techCard.data.output_unit_name}`
                        : "Партия"
                    }
                    valueRender={() =>
                      techCard.isPending ? (
                        <Spin size="small" />
                      ) : techCard.data?.totals.cost != null ? (
                        <Money value={techCard.data.totals.cost} />
                      ) : (
                        <span style={{ color: "#bfbfbf" }}>—</span>
                      )
                    }
                    value={0}
                  />
                </>
              )}
            </Space>
            <div style={{ color: "#8c8c8c", fontSize: 13, marginTop: 8 }}>
              {/* Две цены рядом — не дубль: средняя живёт только пока есть
                  остаток, а сырьё кончается. */}
              Средняя — за одну {unitName(card.base_unit_id)}, по ней списывают в
              себестоимость. Цена последнего прихода
              {card.last_cost_at ? ` от ${fmtDate(card.last_cost_at)}` : ""} остаётся
              и когда остаток кончился.
            </div>
            {isComposite && (card.recipe_cost_missing
              || techCard.data?.totals.missing_cost) && (
              <Alert
                type="warning"
                showIcon
                icon={<WarningOutlined />}
                style={{ marginTop: 8 }}
                message="Себестоимость неполная"
                description="У части компонентов нет цены — итог занижен. Их видно в составе ниже пометкой «нет цены»."
              />
            )}
            {isComposite && techCard.isError && (
              <Alert
                type="info"
                showIcon
                style={{ marginTop: 8 }}
                message="Тех-карты нет"
                description="У этого блюда нет активной тех-карты, поэтому себестоимость по составу не считается."
              />
            )}
          </div>

          {/* ---- состав ---- */}
          {isComposite && techCard.data && (
            <div>
              <Typography.Title level={5}>
                Состав{" "}
                <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                  ({countRows(techCard.data.rows)} компонентов, выход{" "}
                  {fmtQty(techCard.data.output_quantity)}{" "}
                  {techCard.data.output_unit_name})
                </Typography.Text>
              </Typography.Title>
              <Table<TechCardRow>
                rowKey="product_id"
                size="small"
                pagination={false}
                dataSource={techCard.data.rows}
                columns={composition}
                expandable={{ childrenColumnName: "children" }}
                locale={{ emptyText: "Состав пуст" }}
                // Подсветка обещает клик, значит щёлкать должно всю строку, а не
                // только ссылку в названии: иначе наведение врёт.
                rowClassName={() => "row-product"}
                onRow={(row) => ({
                  onClick: () => setTrail((t) => [...t, row.product_id]),
                })}
              />
              <div style={{ color: "#8c8c8c", fontSize: 13, marginTop: 6 }}>
                Нажмите на компонент, чтобы открыть его карточку.
              </div>
            </div>
          )}

          {/* ---- остатки ---- */}
          <div>
            <Typography.Title level={5}>Где лежит</Typography.Title>
            {stock.isPending ? (
              <Spin size="small" />
            ) : onStock.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="На складах нет"
              />
            ) : (
              <Space direction="vertical" size={4} style={{ width: "100%" }}>
                {onStock.map((row) => (
                  <Space
                    key={row.warehouse_id}
                    style={{ width: "100%", justifyContent: "space-between" }}
                  >
                    <span>Склад #{row.warehouse_id}</span>
                    <Space size={16}>
                      <span
                        style={{
                          color: Number(row.quantity) < 0 ? "#cf1322" : undefined,
                        }}
                      >
                        {fmtQty(row.quantity)} {unitName(card.base_unit_id)}
                      </span>
                      <Money value={row.cost_balance} />
                    </Space>
                  </Space>
                ))}
              </Space>
            )}
          </div>

          {/* ---- пищевая ценность ---- */}
          <div>
            <Typography.Title level={5}>Пищевая ценность</Typography.Title>
            {nutrition.isPending ? (
              <Spin size="small" />
            ) : nutrition.isError ? (
              <Alert
                type="info"
                showIcon
                message="Расчёт недоступен"
                description={errorMessage(nutrition.error)}
              />
            ) : nutrition.data ? (
              <>
                <Descriptions size="small" bordered column={2}>
                  <Descriptions.Item label="На 100 г">
                    {nutrition.data.per_100g
                      ? `${fmtQty(nutrition.data.per_100g.energy_kcal)} ккал · Б ${fmtQty(
                          nutrition.data.per_100g.protein,
                        )} · Ж ${fmtQty(nutrition.data.per_100g.fat)} · У ${fmtQty(
                          nutrition.data.per_100g.carbs,
                        )}`
                      : "неизвестен вес единицы"}
                  </Descriptions.Item>
                  <Descriptions.Item
                    label={`На 1 ${unitName(card.base_unit_id)}`}
                  >
                    {`${fmtQty(nutrition.data.per_unit.energy_kcal)} ккал · Б ${fmtQty(
                      nutrition.data.per_unit.protein,
                    )} · Ж ${fmtQty(nutrition.data.per_unit.fat)} · У ${fmtQty(
                      nutrition.data.per_unit.carbs,
                    )}`}
                  </Descriptions.Item>
                </Descriptions>
                {!nutrition.data.complete && (
                  <Alert
                    type="warning"
                    showIcon
                    style={{ marginTop: 8 }}
                    message="Значения занижены"
                    description={`Без КБЖУ: ${nutrition.data.missing_product_names
                      .slice(0, 8)
                      .join(", ")}${
                      nutrition.data.missing_product_names.length > 8 ? " и др." : ""
                    }`}
                  />
                )}
              </>
            ) : null}
          </div>

          {/* ---- реквизиты ---- */}
          <div>
            <Typography.Title level={5}>Основное</Typography.Title>
            <Descriptions size="small" bordered column={1}>
              <Descriptions.Item label="Артикул">
                {card.sku || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Категория">
                {card.category || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Группа номенклатуры">
                {card.group_name || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Базовая единица">
                {unitName(card.base_unit_id)}
              </Descriptions.Item>
              <Descriptions.Item label="Вес одной единицы">
                {card.unit_weight_kg ? `${fmtQty(card.unit_weight_kg)} кг` : "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Создан">
                {fmtDate(card.created_at)}
              </Descriptions.Item>
            </Descriptions>
          </div>
        </Space>
      )}
    </Drawer>
  );
}
