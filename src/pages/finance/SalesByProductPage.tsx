/** /reports/sales-by-product — продажи, себестоимость и прибыль по каждому товару.
 *
 *  Отвечает на вопрос «на чём мы зарабатываем»: сколько продали, за сколько, во
 *  сколько это обошлось и что осталось. Товар, а не позиция меню: один и тот же
 *  круассан продаётся под несколькими позициями и в разных прайс-листах. */
import { Alert, Card, Descriptions, Input, Space, Table, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import { fetchSalesByProduct, type ProductSalesRow } from "@/api/finance";
import { fmtDate, fmtMoney, fmtQty, Money } from "@/components/format";
import { fmtPct } from "@/pages/finance/labels";
import { ReportRangePicker, useReportRange } from "@/pages/finance/reportRange";

export default function SalesByProductPage() {
  const { range, setRange, params } = useReportRange();
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["sales-by-product", params],
    queryFn: () => fetchSalesByProduct(params),
  });

  const rows = useMemo(() => {
    const all = query.data?.rows ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        (r.sku ?? "").toLowerCase().includes(needle),
    );
  }, [query.data, search]);

  const totals = query.data?.totals;
  const missing = (query.data?.rows ?? []).filter((r) => r.cost_missing).length;

  const columns: ColumnsType<ProductSalesRow> = [
    { title: "Артикул", dataIndex: "sku", width: 100, render: (v) => v ?? "—" },
    {
      title: "Товар",
      dataIndex: "name",
      render: (name: string, row) => (
        <>
          {name}
          {row.cost_missing && (
            <Tooltip title="Себестоимость не посчитана: у товара нет тех-карты или основы для цены. Прибыль завышена.">
              <Tag color="warning" style={{ marginInlineStart: 8 }}>
                нет себестоимости
              </Tag>
            </Tooltip>
          )}
          {Number(row.replacement_quantity) > 0 && (
            <Tooltip title={`Из них отдано заменами: ${fmtQty(row.replacement_quantity)}`}>
              <Tag color="blue" style={{ marginInlineStart: 8 }}>
                замены
              </Tag>
            </Tooltip>
          )}
        </>
      ),
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    { title: "Категория", dataIndex: "category", width: 140, render: (v) => v ?? "—" },
    {
      title: "Продано",
      dataIndex: "quantity",
      width: 100,
      align: "right",
      render: (v: string) => fmtQty(v),
      sorter: (a, b) => Number(a.quantity) - Number(b.quantity),
    },
    {
      title: "Чеков",
      dataIndex: "check_count",
      width: 90,
      align: "right",
      sorter: (a, b) => a.check_count - b.check_count,
    },
    {
      title: "Средняя цена",
      dataIndex: "avg_price",
      width: 120,
      align: "right",
      render: (v: string | null) => (v == null ? "—" : fmtMoney(v)),
    },
    {
      title: "Выручка",
      dataIndex: "revenue",
      width: 130,
      align: "right",
      render: (v: string) => <Money value={v} />,
      defaultSortOrder: "descend",
      sorter: (a, b) => Number(a.revenue) - Number(b.revenue),
    },
    {
      title: "Себестоимость",
      dataIndex: "cost",
      width: 130,
      align: "right",
      render: (v: string) => <Money value={v} />,
      sorter: (a, b) => Number(a.cost) - Number(b.cost),
    },
    {
      title: "Прибыль",
      dataIndex: "profit",
      width: 130,
      align: "right",
      render: (v: string) => <Money value={v} />,
      sorter: (a, b) => Number(a.profit) - Number(b.profit),
    },
    {
      title: "Маржа",
      dataIndex: "margin_pct",
      width: 100,
      align: "right",
      render: (v: string | null) => fmtPct(v),
      sorter: (a, b) => Number(a.margin_pct ?? 0) - Number(b.margin_pct ?? 0),
    },
    {
      title: "Фуд-кост",
      dataIndex: "food_cost_pct",
      width: 100,
      align: "right",
      render: (v: string | null) => fmtPct(v),
    },
  ];

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Продажи по товарам</h2>

      <Space wrap style={{ marginBottom: 16 }}>
        <ReportRangePicker value={range} onChange={setRange} />
        <Input.Search
          allowClear
          placeholder="Поиск по названию или артикулу"
          style={{ width: 300 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Space>

      {query.isError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message={errorMessage(query.error)}
        />
      )}

      {totals && (
        <Card
          size="small"
          style={{ marginBottom: 16 }}
          title={`Итого за ${fmtDate(query.data!.date_from)} — ${fmtDate(query.data!.date_to)}`}
        >
          <Descriptions
            size="small"
            column={{ xs: 1, sm: 2, lg: 4 }}
            items={[
              { key: "pos", label: "Позиций", children: totals.positions },
              { key: "qty", label: "Продано", children: fmtQty(totals.quantity) },
              { key: "checks", label: "Чеков", children: totals.check_count },
              {
                key: "rev",
                label: "Выручка по строкам",
                children: <Money value={totals.revenue_lines} />,
              },
              {
                key: "disc",
                label: "Скидка на чек",
                children: <Money value={totals.check_discount_total} />,
              },
              {
                key: "deliv",
                label: "Доставка",
                children: <Money value={totals.delivery_total} />,
              },
              {
                key: "revc",
                label: "Выручка чеков",
                children: (
                  <Tooltip title="Строки минус скидка на чек плюс доставка — эта цифра совпадает с P&L">
                    <b>
                      <Money value={totals.revenue_checks} />
                    </b>
                  </Tooltip>
                ),
              },
              { key: "cost", label: "Себестоимость", children: <Money value={totals.cost} /> },
              {
                key: "profit",
                label: "Прибыль по строкам",
                children: (
                  <b>
                    <Money value={totals.profit} />
                  </b>
                ),
              },
              { key: "margin", label: "Маржа", children: fmtPct(totals.margin_pct) },
            ]}
          />
        </Card>
      )}

      {missing > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={`У ${missing} позиций себестоимость не посчитана`}
          description="Товар продан, а списания по нему нет: у товара нет тех-карты либо нет основы для цены. Прибыль и маржа по этим строкам завышены."
        />
      )}

      <Table<ProductSalesRow>
        rowKey="product_id"
        size="small"
        loading={query.isPending}
        dataSource={rows}
        columns={columns}
        pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (t) => `${t} позиций` }}
        scroll={{ x: 1500 }}
      />
    </div>
  );
}
