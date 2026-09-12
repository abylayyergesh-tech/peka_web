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
import { EditOutlined, WarningOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { useCan } from "@/auth/store";
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
import { useWarehousesLookup, warehouseLabel } from "@/pages/inventory/shared";

type TrailStop = { id: number; name: string };

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
  const [trail, setTrail] = useState<TrailStop[]>([]);
  const navigate = useNavigate();
  const warehouses = useWarehousesLookup();
  const canReport = useCan("report.read");
  const current = trail.length ? trail[trail.length - 1].id : productId;

  // Панель открыли на другом товаре — путь начинается заново.
  useEffect(() => {
    setTrail(productId == null ? [] : [{ id: productId, name: "" }]);
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
              setTrail((t) => [...t, { id: row.product_id, name: row.name }]);
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
      width={760}
      destroyOnHidden
      className="dossier-drawer"
      title={
        <div>
          {canGoBack && (
            <div className="dossier-crumbs">
              {trail.map((stop, i) => {
                const last = i === trail.length - 1;
                const label = last
                  ? (card?.name ?? (stop.name || "…"))
                  : (stop.name || "…");
                return (
                  <span key={`${stop.id}-${i}`}>
                    {i > 0 && <span className="dossier-crumb-now"> · </span>}
                    {last ? (
                      <span className="dossier-crumb-now">{label}</span>
                    ) : (
                      <button
                        type="button"
                        className="dossier-crumb"
                        onClick={() => setTrail((t) => t.slice(0, i + 1))}
                      >
                        {label}
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          )}
          <p className="page-kicker" style={{ marginBottom: 4 }}>
            Личное дело
          </p>
          <h2 className="dossier-name">{card?.name ?? "…"}</h2>
          {card && (
            <Space size={6} wrap style={{ marginTop: 8 }}>
              <Tag color={PRODUCT_KIND_COLORS[card.kind]} style={{ marginInlineEnd: 0 }}>
                {PRODUCT_KIND_LABELS[card.kind]}
              </Tag>
              <Tag color={ITEM_TYPE_COLORS[card.item_type]} style={{ marginInlineEnd: 0 }}>
                {ITEM_TYPE_LABELS[card.item_type]}
              </Tag>
              {!card.is_active && <Tag style={{ marginInlineEnd: 0 }}>неактивен</Tag>}
            </Space>
          )}
        </div>
      }
      extra={
        <Space>
          {canReport && current != null && (
            <Button
              onClick={() =>
                navigate(`/reports/product-movements?product_id=${current}`)
              }
            >
              Движение
            </Button>
          )}
          {isComposite && techCard.data?.recipe_id && (
            <Button onClick={() => navigate(`/recipes/${techCard.data.recipe_id}`)}>
              Тех-карта
            </Button>
          )}
          {card && onEdit ? (
            <Button type="primary" icon={<EditOutlined />} onClick={() => onEdit(card)}>
              Редактировать
            </Button>
          ) : null}
        </Space>
      }
    >
      {product.isPending && <Spin />}
      {product.isError && (
        <Alert type="error" showIcon message={errorMessage(product.error)} />
      )}

      {card && (
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <section className="dossier-block">
            <h3 className="dossier-block-title">Себестоимость</h3>
            <div className="dossier-stat-grid">
              <div className="dossier-stat">
                <span className="dossier-stat-label">Средняя по остатку</span>
                <div className="dossier-stat-value">
                  <Money value={card.avg_cost ?? "0"} />
                </div>
              </div>
              <div className="dossier-stat">
                <span className="dossier-stat-label">Последний приход</span>
                <div className="dossier-stat-value">
                  <Money value={card.last_cost_price ?? null} />
                </div>
              </div>
              {isComposite && (
                <>
                  <div className="dossier-stat">
                    <span className="dossier-stat-label">
                      Тех-карта / 1 {unitName(card.base_unit_id)}
                    </span>
                    <div className="dossier-stat-value">
                      {card.recipe_cost != null ? (
                        <Money value={card.recipe_cost} />
                      ) : (
                        <span style={{ color: "#bfbfbf" }}>—</span>
                      )}
                    </div>
                  </div>
                  <div className="dossier-stat">
                    <span className="dossier-stat-label">
                      {techCard.data
                        ? `Партия ${fmtQty(techCard.data.output_quantity)} ${techCard.data.output_unit_name}`
                        : "Партия"}
                    </span>
                    <div className="dossier-stat-value">
                      {techCard.isPending ? (
                        <Spin size="small" />
                      ) : techCard.data?.totals.cost != null ? (
                        <Money value={techCard.data.totals.cost} />
                      ) : (
                        <span style={{ color: "#bfbfbf" }}>—</span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            <p className="dossier-note">
              Средняя — за одну {unitName(card.base_unit_id)}, по ней списывают.
              Цена последнего прихода
              {card.last_cost_at ? ` от ${fmtDate(card.last_cost_at)}` : ""} остаётся,
              когда остаток кончился.
            </p>
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
          </section>

          {/* ---- состав ---- */}
          {isComposite && techCard.data && (
            <section className="dossier-block">
              <h3 className="dossier-block-title">
                Состав · {countRows(techCard.data.rows)} комп. · выход{" "}
                {fmtQty(techCard.data.output_quantity)} {techCard.data.output_unit_name}
              </h3>
              <Table<TechCardRow>
                rowKey="product_id"
                size="small"
                pagination={false}
                dataSource={techCard.data.rows}
                columns={composition}
                expandable={{ childrenColumnName: "children" }}
                locale={{ emptyText: "Состав пуст" }}
                rowClassName={() => "row-product"}
                onRow={(row) => ({
                  onClick: () =>
                    setTrail((t) => [...t, { id: row.product_id, name: row.name }]),
                })}
              />
              <p className="dossier-note">
                Наведите на компонент — строка загорится. Нажмите — его личное дело.
              </p>
            </section>
          )}

          <section className="dossier-block">
            <h3 className="dossier-block-title">Где лежит</h3>
            {stock.isPending ? (
              <Spin size="small" />
            ) : onStock.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="На складах нет"
              />
            ) : (
              onStock.map((row) => {
                const wh = warehouses.byId.get(row.warehouse_id);
                return (
                  <div key={row.warehouse_id} className="dossier-stock">
                    <span className="row-card-title">
                      {wh ? warehouseLabel(wh) : `Склад #${row.warehouse_id}`}
                    </span>
                    <Space size={16}>
                      <span
                        style={{
                          color: Number(row.quantity) < 0 ? "#cf1322" : undefined,
                          fontVariantNumeric: "tabular-nums",
                          fontWeight: 700,
                        }}
                      >
                        {fmtQty(row.quantity)} {unitName(card.base_unit_id)}
                      </span>
                      <Money value={row.cost_balance} />
                    </Space>
                  </div>
                );
              })
            )}
          </section>

          <section className="dossier-block">
            <h3 className="dossier-block-title">Пищевая ценность</h3>
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
                {nutrition.data.per_100g ? (
                  <>
                    <p className="dossier-note" style={{ marginTop: 0 }}>
                      На 100 г
                    </p>
                    <div className="nutri-grid">
                      <div className="nutri-cell">
                        <strong>{fmtQty(nutrition.data.per_100g.energy_kcal)}</strong>
                        <span>ккал</span>
                      </div>
                      <div className="nutri-cell">
                        <strong>{fmtQty(nutrition.data.per_100g.protein)}</strong>
                        <span>белки</span>
                      </div>
                      <div className="nutri-cell">
                        <strong>{fmtQty(nutrition.data.per_100g.fat)}</strong>
                        <span>жиры</span>
                      </div>
                      <div className="nutri-cell">
                        <strong>{fmtQty(nutrition.data.per_100g.carbs)}</strong>
                        <span>углеводы</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="dossier-note" style={{ marginTop: 0 }}>
                    На 100 г неизвестно: нет веса единицы
                  </p>
                )}
                <p className="dossier-note">На 1 {unitName(card.base_unit_id)}</p>
                <div className="nutri-grid">
                  <div className="nutri-cell">
                    <strong>{fmtQty(nutrition.data.per_unit.energy_kcal)}</strong>
                    <span>ккал</span>
                  </div>
                  <div className="nutri-cell">
                    <strong>{fmtQty(nutrition.data.per_unit.protein)}</strong>
                    <span>белки</span>
                  </div>
                  <div className="nutri-cell">
                    <strong>{fmtQty(nutrition.data.per_unit.fat)}</strong>
                    <span>жиры</span>
                  </div>
                  <div className="nutri-cell">
                    <strong>{fmtQty(nutrition.data.per_unit.carbs)}</strong>
                    <span>углеводы</span>
                  </div>
                </div>
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
          </section>

          <section className="dossier-block">
            <h3 className="dossier-block-title">Основное</h3>
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
          </section>
        </Space>
      )}
    </Drawer>
  );
}
