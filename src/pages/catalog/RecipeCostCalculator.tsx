/** Модалка просчёта себестоимости: вклад каждого ингредиента и итог. */
import { Alert, Modal, Space, Table, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";

import type { TechCard, TechCardRow } from "@/api/reports";
import { fmtMoney, fmtQty } from "@/components/format";

interface CalcRow extends Omit<TechCardRow, "children"> {
  key: string;
  no: string;
  children?: CalcRow[];
}

function toRows(rows: TechCardRow[], prefix = ""): CalcRow[] {
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

export default function RecipeCostCalculator({
  open,
  card,
  onClose,
}: {
  open: boolean;
  card: TechCard | null;
  onClose: () => void;
}) {
  const rows = card ? toRows(card.rows) : [];
  const totals = card?.totals;
  const pricing = card?.pricing;

  const columns: ColumnsType<CalcRow> = [
    { title: "№", dataIndex: "no", width: 56 },
    { title: "Артикул", dataIndex: "sku", width: 90, render: (v: string | null) => v ?? "—" },
    {
      title: "Наименование",
      dataIndex: "name",
      render: (name: string, row) => (
        <>
          {name}
          {row.children && (
            <Tag color="gold" style={{ marginInlineStart: 8 }}>
              ПФ
            </Tag>
          )}
          {row.missing_cost && (
            <Tag color="warning" style={{ marginInlineStart: 8 }}>
              нет цены
            </Tag>
          )}
          {row.nutrition_missing && (
            <Tag color="error" style={{ marginInlineStart: 8 }}>
              нет КБЖУ
            </Tag>
          )}
        </>
      ),
    },
    { title: "Ед. изм.", dataIndex: "unit_name", width: 80 },
    {
      title: "Брутто",
      dataIndex: "package_count",
      width: 90,
      align: "right",
      render: (v: string) => fmtQty(v),
    },
    {
      title: "Цена за ед.",
      dataIndex: "unit_cost",
      width: 110,
      align: "right",
      render: (v: string | null) => (v == null ? "—" : fmtMoney(v)),
    },
    {
      title: "Себестоимость",
      dataIndex: "cost_total",
      width: 120,
      align: "right",
      render: (v: string | null) => (v == null ? "—" : fmtMoney(v)),
    },
    {
      title: "За ед. веса",
      dataIndex: "cost_per_kg",
      width: 110,
      align: "right",
      render: (v: string | null) => (v == null ? "—" : fmtMoney(v)),
    },
  ];

  return (
    <Modal
      title="Просчёт себестоимости"
      open={open}
      onCancel={onClose}
      footer={null}
      width={960}
      destroyOnHidden
    >
      {card && (
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <div>
            <b>{card.name}</b>
            {card.sku ? ` · арт. ${card.sku}` : ""} · норма закладки{" "}
            {fmtQty(card.output_quantity)} {card.output_unit_name}
          </div>
          <Table<CalcRow>
            rowKey="key"
            size="small"
            pagination={false}
            dataSource={rows}
            columns={columns}
            expandable={{ defaultExpandAllRows: true }}
            scroll={{ x: 800 }}
            summary={() =>
              totals ? (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={6}>
                    <b>Итого</b>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="right">
                    <b>{fmtMoney(totals.cost)}</b>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={7} />
                </Table.Summary.Row>
              ) : null
            }
          />
          {totals?.missing_cost && (
            <Alert
              type="warning"
              showIcon
              message="Себестоимость неполная — у части ингредиентов нет цены"
            />
          )}
          {card.nutrition && (
            <Space size={32} wrap>
              <Figure
                label="КБЖУ на 100 г"
                value={
                  card.nutrition.per_100g
                    ? `${fmtQty(card.nutrition.per_100g.energy_kcal)} ккал`
                    : "—"
                }
                hint={
                  card.nutrition.per_100g
                    ? `Б ${fmtQty(card.nutrition.per_100g.protein)} · Ж ${fmtQty(card.nutrition.per_100g.fat)} · У ${fmtQty(card.nutrition.per_100g.carbs)}`
                    : undefined
                }
              />
              <Figure
                label="КБЖУ на норму"
                value={`${fmtQty(card.nutrition.per_unit.energy_kcal)} ккал`}
                hint={`Б ${fmtQty(card.nutrition.per_unit.protein)} · Ж ${fmtQty(card.nutrition.per_unit.fat)} · У ${fmtQty(card.nutrition.per_unit.carbs)}`}
              />
            </Space>
          )}
          {!card.nutrition?.complete && (card.nutrition?.missing_product_names.length ?? 0) > 0 && (
            <Alert
              type="error"
              showIcon
              message="У сырья не заполнено КБЖУ"
              description={card.nutrition?.missing_product_names.join(", ")}
            />
          )}
          {pricing && (
            <Space size={32} wrap>
              <Figure label="Розничная цена" value={fmtMoney(pricing.sale_price)} />
              <Figure
                label={totals?.cost_estimated ? "Себестоимость ≈" : "Себестоимость"}
                value={fmtMoney(totals?.cost ?? null)}
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
            </Space>
          )}
        </Space>
      )}
    </Modal>
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
      <div style={{ color: "#8c8c8c", fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600 }}>{value}</div>
    </div>
  );
  return hint ? <Tooltip title={hint}>{body}</Tooltip> : body;
}
