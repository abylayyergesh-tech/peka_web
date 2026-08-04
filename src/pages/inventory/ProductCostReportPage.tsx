/** /reports/product-cost — себестоимость как калькуляционная карта.
 *
 *  Показывает не одну цифру, а весь расчёт: по каждому компоненту фасовку,
 *  брутто, потери при холодной и горячей обработке, выход и деньги; вложенные
 *  полуфабрикаты разворачиваются и уже отмасштабированы под нужное количество.
 *
 *  Только просмотр — редактировать состав здесь нельзя, это делают тех-карты.
 *  Деньги считаются по БРУТТО: потери на себестоимость не влияют. Цена продажи
 *  наоборот на себестоимость не влияет вовсе, но зависит от прайс-листа, поэтому
 *  выбирается в самом поле (плюс вариант «средняя»).
 *
 *  У сырья тех-карты нет — для него страница показывает среднюю закупочную. */
import { Alert, Select, Space, Table, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { errorCode, errorMessage, fetchAllPages } from "@/api/client";
import { listUnits } from "@/api/catalog";
import { listMenus } from "@/api/sales";
import { getProductCost, getTechCard, type TechCardRow } from "@/api/reports";
import { fmtDate, fmtMoney, fmtQty } from "@/components/format";
import { useProductsLookup } from "@/pages/inventory/shared";

/** Выбор цены продажи: базовые цены, конкретный прайс-лист или средняя. */
type PriceSource = "base" | "average" | number;

/** `children` у AntD означает «разворачивать эту строку», поэтому у листа его не
 *  должно быть вовсе — пустой массив рисует бесполезную стрелку. Отсюда Omit. */
interface CardRow extends Omit<TechCardRow, "children"> {
  key: string;
  /** Номер строки: «3» у корневой, «3.1» у компонента полуфабриката. */
  no: string;
  children?: CardRow[];
}

function toRows(rows: TechCardRow[], prefix = ""): CardRow[] {
  return rows.map((row, i) => {
    const no = `${prefix}${i + 1}`;
    return {
      ...row,
      key: no,
      no,
      children: row.children.length ? toRows(row.children, `${no}.`) : undefined,
    };
  });
}

/** «—» вместо нуля: нули в шести колонках подряд читать невозможно.
 *  Отрицательные потери — это ПРИБАВКА веса (замачивание, варка с набором
 *  воды), и молча показывать её как потерю нельзя. */
function Loss({ value }: { value: string | null }) {
  if (value == null) return <>—</>;
  const n = Number(value);
  if (!n) return <span style={{ color: "#bfbfbf" }}>—</span>;
  if (n < 0) {
    return (
      <Tooltip title="Вес прибавился при обработке (замачивание, набор воды)">
        <span style={{ color: "#1677ff" }}>+{fmtQty(-n)} %</span>
      </Tooltip>
    );
  }
  return <>{fmtQty(n)} %</>;
}

/** Килограммы. Прочерк с подсказкой — когда у товара не задан вес единицы:
 *  выдумывать вес нельзя, а тихо показать 0 значило бы соврать в итоге. */
function Kg({ value }: { value: string | null }) {
  if (value == null) {
    return (
      <Tooltip title="У товара не задан вес единицы — в килограммы не пересчитать">
        <span style={{ color: "#bfbfbf" }}>—</span>
      </Tooltip>
    );
  }
  return <>{fmtQty(value)}</>;
}

export default function ProductCostReportPage() {
  const products = useProductsLookup();
  const [productId, setProductId] = useState<number | undefined>();
  const [price, setPrice] = useState<PriceSource>("base");

  const menus = useQuery({
    queryKey: ["lookup", "menus", "active"],
    queryFn: () => listMenus({ active: true }),
    staleTime: 60_000,
  });

  const card = useQuery({
    queryKey: ["tech-card", { productId, price }],
    queryFn: () =>
      getTechCard(productId as number, {
        average: price === "average" ? true : undefined,
        menu_id: typeof price === "number" ? price : undefined,
      }),
    enabled: productId != null,
    retry: false,
  });

  // У сырья тех-карты нет, и карту строить не из чего — но средняя закупочная у
  // него есть, и именно она попадает в карты блюд. Показываем её, а не ошибку.
  const noRecipe = errorCode(card.error) === "no_active_recipe";
  const raw = useQuery({
    queryKey: ["product-cost", { productId }],
    queryFn: () => getProductCost(productId as number),
    enabled: productId != null && noRecipe,
  });
  const units = useQuery({
    queryKey: ["lookup", "units", "all"],
    queryFn: () => fetchAllPages((pg) => listUnits(pg)),
    staleTime: 60_000,
    enabled: noRecipe,
  });

  const priceOptions = [
    { value: "base" as PriceSource, label: "Основное меню (базовые цены)" },
    ...(menus.data ?? [])
      .filter((m) => !m.is_default)
      .map((m) => ({ value: m.menu_id as PriceSource, label: m.name })),
    { value: "average" as PriceSource, label: "Средняя по прайс-листам" },
  ];

  const rows = card.data ? toRows(card.data.rows) : [];
  const totals = card.data?.totals;
  const pricing = card.data?.pricing;

  const columns: ColumnsType<CardRow> = [
    { title: "№", dataIndex: "no", width: 64, className: "no-wrap" },
    { title: "Артикул", dataIndex: "sku", width: 96, render: (v: string | null) => v ?? "—" },
    {
      title: "Название",
      dataIndex: "name",
      render: (name: string, row) => (
        <>
          {name}
          {row.children && <Tag style={{ marginInlineStart: 8 }}>ПФ</Tag>}
          {row.missing_cost && (
            <Tooltip
              title={
                row.children
                  ? "В составе есть компонент без цены — сумма ниже настоящей"
                  : "Нет основы для себестоимости: по товару не было прихода"
              }
            >
              <Tag color="warning" style={{ marginInlineStart: 8 }}>
                нет цены
              </Tag>
            </Tooltip>
          )}
          {row.cost_source === "last_price" && (
            <Tooltip
              title={`Товара нет на остатке — цена взята из последнего прихода${
                row.last_cost_at ? ` от ${fmtDate(row.last_cost_at)}` : ""
              }`}
            >
              <Tag color="blue" style={{ marginInlineStart: 8 }}>
                по последней цене
              </Tag>
            </Tooltip>
          )}
          {row.cost_source === "service" && (
            <Tooltip title="Статья затрат (ФОТ, аренда): ставки нет, в расчёт входит нулём">
              <Tag style={{ marginInlineStart: 8 }}>статья</Tag>
            </Tooltip>
          )}
        </>
      ),
    },
    { title: "Фасовка", dataIndex: "unit_name", width: 96 },
    {
      title: "Количество фасовок",
      dataIndex: "package_count",
      width: 120,
      align: "right",
      render: (v: string) => fmtQty(v),
    },
    {
      title: "Брутто",
      dataIndex: "brutto_kg",
      width: 110,
      align: "right",
      render: (v: string | null) => <Kg value={v} />,
    },
    {
      title: "Потери при холодной обработке",
      dataIndex: "cold_loss_pct",
      width: 130,
      align: "right",
      render: (v: string | null) => <Loss value={v} />,
    },
    {
      title: "Нетто",
      dataIndex: "netto_kg",
      width: 110,
      align: "right",
      render: (v: string | null) => <Kg value={v} />,
    },
    {
      title: "Потери при горячей обработке",
      dataIndex: "hot_loss_pct",
      width: 130,
      align: "right",
      render: (v: string | null) => <Loss value={v} />,
    },
    {
      title: "Выход готового",
      dataIndex: "yield_kg",
      width: 110,
      align: "right",
      render: (v: string | null) => <Kg value={v} />,
    },
    {
      title: "Себестоимость всего",
      dataIndex: "cost_total",
      width: 140,
      align: "right",
      render: (v: string | null) => (v == null ? "—" : fmtMoney(v)),
    },
  ];

  const rawUnit = productId
    ? units.data?.find(
        (u) => u.unit_id === products.byId.get(productId)?.base_unit_id,
      )?.name
    : undefined;

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Себестоимость</h2>
      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="Продукт"
          style={{ width: 320 }}
          options={products.options}
          value={productId}
          onChange={(v) => setProductId(v)}
          loading={products.isPending}
        />
        <Select<PriceSource>
          style={{ width: 260 }}
          options={priceOptions}
          value={price}
          onChange={setPrice}
          loading={menus.isPending}
        />
      </Space>

      {card.isError && !noRecipe && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message={errorMessage(card.error)}
        />
      )}

      {productId == null ? (
        <Alert type="info" showIcon message="Выберите продукт." />
      ) : noRecipe ? (
        <Alert
          type="info"
          showIcon
          message="У товара нет тех-карты — это сырьё"
          description={
            raw.data
              ? `Средняя себестоимость 1 ${rawUnit ?? "ед."}: ${
                  raw.data.cost_per_base_unit == null
                    ? "нет данных (не было прихода)"
                    : fmtMoney(raw.data.cost_per_base_unit)
                }`
              : "Считаем среднюю закупочную…"
          }
        />
      ) : (
        <>
          <Table<CardRow>
            key={productId}
            rowKey="key"
            size="small"
            loading={card.isPending}
            dataSource={rows}
            columns={columns}
            pagination={false}
            scroll={{ x: 1400 }}
            expandable={{ defaultExpandAllRows: true }}
            title={() =>
              card.data ? (
                <span>
                  <b>{card.data.name}</b>
                  {card.data.sku ? ` · арт. ${card.data.sku}` : ""} · выход{" "}
                  {fmtQty(card.data.output_quantity)} {card.data.output_unit_name}
                </span>
              ) : null
            }
            summary={() =>
              totals ? (
                <Table.Summary fixed>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={5}>
                      <b>Итого</b>
                      {totals.missing_weight && (
                        <Tooltip title="Часть строк не переведена в килограммы: у товаров не задан вес единицы">
                          <Tag color="warning" style={{ marginInlineStart: 8 }}>
                            вес неполный
                          </Tag>
                        </Tooltip>
                      )}
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={5} align="right">
                      <b>{fmtQty(totals.brutto_kg)}</b>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={6} />
                    <Table.Summary.Cell index={7} align="right">
                      <b>{fmtQty(totals.netto_kg)}</b>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={8} />
                    <Table.Summary.Cell index={9} align="right">
                      <b>{fmtQty(totals.yield_kg)}</b>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={10} align="right">
                      <b>{fmtMoney(totals.cost)}</b>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              ) : null
            }
          />

          {totals?.missing_cost && (
            <Alert
              type="warning"
              showIcon
              style={{ marginTop: 12 }}
              message="Себестоимость неполная"
              description="У части компонентов нет основы для цены — по ним не было прихода. В сумму они не вошли."
            />
          )}

          {totals?.cost_estimated && !totals.missing_cost && (
            <Alert
              type="info"
              showIcon
              style={{ marginTop: 12 }}
              message="Часть строк оценена по последней цене прихода"
              description="Этих товаров нет на остатке, поэтому средней себестоимости у них нет. Сумма посчитана полностью, но точной её считать нельзя."
            />
          )}

          {pricing && totals && (
            <Space wrap size={32} style={{ marginTop: 16 }}>
              <Figure
                label={`Цена продажи · ${pricing.menu_label}`}
                value={fmtMoney(pricing.sale_price)}
                hint={
                  pricing.sale_price == null
                    ? "Товар не продаётся по выбранному прайс-листу"
                    : undefined
                }
              />
              <Figure
                label={totals.cost_estimated ? "Себестоимость ≈" : "Себестоимость"}
                value={fmtMoney(totals.cost)}
                hint={
                  totals.cost_estimated
                    ? "Часть строк оценена по цене последнего прихода"
                    : undefined
                }
              />
              <Figure label="Наценка" value={fmtMoney(pricing.markup)} />
              <Figure
                label="Фуд-кост"
                value={
                  pricing.food_cost_pct == null
                    ? "—"
                    : `${fmtQty(pricing.food_cost_pct)} %`
                }
                hint="Доля себестоимости в цене продажи"
              />
              <Figure label="Брутто, кг" value={fmtQty(totals.brutto_kg)} />
              <Figure label="Нетто, кг" value={fmtQty(totals.netto_kg)} />
              <Figure label="Выход, кг" value={fmtQty(totals.yield_kg)} />
            </Space>
          )}
        </>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  const body = (
    <div>
      <div style={{ color: "#8c8c8c", fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600 }}>{value}</div>
    </div>
  );
  return hint ? <Tooltip title={hint}>{body}</Tooltip> : body;
}
