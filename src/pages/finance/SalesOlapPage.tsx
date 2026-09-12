/** /reports/sales-olap — продажи по клиентам и товарам.
 *
 *  Тот же период и те же чеки, что «Продажи по товарам», но зерно другое:
 *  клиент → товар. Розница без контрагента — узел «Розница».
 *
 *  Три суммы по строкам не обязаны совпадать: базовая цена живёт в позиции,
 *  прейскурант снят в чеке, выручка уже со скидкой строки. Сумма заказа —
 *  итог чека (доставка и скидка чека), поэтому она только у клиента. */
import { Alert, Card, Descriptions, Input, Select, Space, Table, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import { fetchSalesOlap, type OlapSalesRow } from "@/api/finance";
import { listAllCustomers, listMenus } from "@/api/sales";
import { fmtDate, fmtQty, Money } from "@/components/format";
import { fmtPct } from "@/pages/finance/labels";
import { ReportRangePicker, useReportRange } from "@/pages/finance/reportRange";

/** Пустой `children` рисует стрелку раскрытия без смысла — у листа поля нет. */
function toTableRows(rows: OlapSalesRow[]): OlapSalesRow[] {
  return rows.map((row) => {
    const { children, ...rest } = row;
    if (!children?.length) return rest as OlapSalesRow;
    return { ...rest, children: toTableRows(children) };
  });
}

function filterTree(rows: OlapSalesRow[], needle: string): OlapSalesRow[] {
  const n = needle.trim().toLowerCase();
  if (!n) return rows;
  const out: OlapSalesRow[] = [];
  for (const row of rows) {
    const self =
      row.name.toLowerCase().includes(n) ||
      row.customer_name.toLowerCase().includes(n) ||
      (row.sku ?? "").toLowerCase().includes(n);
    const kids = row.children ? filterTree(row.children, n) : [];
    if (self) out.push(row);
    else if (kids.length) out.push({ ...row, children: kids });
  }
  return out;
}

export default function SalesOlapPage() {
  const { range, setRange, params } = useReportRange();
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState<number | undefined>();
  const [menuId, setMenuId] = useState<number | undefined>();

  const query = useQuery({
    queryKey: ["sales-olap", params, customerId, menuId],
    queryFn: () =>
      fetchSalesOlap({
        ...params,
        customer: customerId,
        menu: menuId,
      }),
  });

  const customers = useQuery({
    queryKey: ["customers-lookup", "sales-olap"],
    queryFn: () => listAllCustomers({ active: true }),
    staleTime: 60_000,
  });

  const menus = useQuery({
    queryKey: ["menus", "active", "sales-olap"],
    queryFn: () => listMenus({ active: true }),
    staleTime: 60_000,
  });

  const rows = useMemo(() => {
    const tree = toTableRows(query.data?.rows ?? []);
    return filterTree(tree, search);
  }, [query.data, search]);

  // defaultExpandAllRows срабатывает только на первом маунте, а строки
  // приезжают после запроса — без ключей дерево осталось бы свёрнутым.
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  useEffect(() => {
    setExpandedKeys(rows.filter((r) => r.children?.length).map((r) => r.key));
  }, [rows]);

  const totals = query.data?.totals;
  const missing = useMemo(() => {
    let n = 0;
    for (const customer of query.data?.rows ?? []) {
      for (const child of customer.children ?? []) {
        if (child.cost_missing) n += 1;
      }
    }
    return n;
  }, [query.data]);

  const columns: ColumnsType<OlapSalesRow> = [
    {
      title: "Наименование",
      dataIndex: "name",
      render: (name: string, row) => (
        <>
          {row.is_customer && row.customer_id != null ? (
            <Link to={`/customers/${row.customer_id}`}>{name}</Link>
          ) : (
            name
          )}
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
    {
      title: "Артикул",
      dataIndex: "sku",
      width: 100,
      render: (v, row) => (row.is_customer ? "" : (v ?? "—")),
    },
    {
      title: "Категория",
      dataIndex: "category",
      width: 130,
      render: (v, row) => (row.is_customer ? "" : (v ?? "—")),
    },
    {
      title: "Продано",
      dataIndex: "quantity",
      width: 90,
      align: "right",
      render: (v: string) => fmtQty(v),
      sorter: (a, b) => Number(a.quantity) - Number(b.quantity),
    },
    {
      title: "Чеков",
      dataIndex: "check_count",
      width: 80,
      align: "right",
      sorter: (a, b) => a.check_count - b.check_count,
    },
    {
      title: (
        <Tooltip title="Количество × текущая базовая цена позиции («Основное меню»). Снимка базовой цены в чеке нет — цифра живёт вместе с прайсом.">
          По ценам товаров
        </Tooltip>
      ),
      dataIndex: "base_amount",
      width: 140,
      align: "right",
      render: (v: string) => <Money value={v} />,
      sorter: (a, b) => Number(a.base_amount) - Number(b.base_amount),
    },
    {
      title: (
        <Tooltip title="Количество × цена из строки чека: снимок прейскуранта на момент продажи, без скидки строки.">
          По прейскуранту
        </Tooltip>
      ),
      dataIndex: "list_amount",
      width: 140,
      align: "right",
      render: (v: string) => <Money value={v} />,
      sorter: (a, b) => Number(a.list_amount) - Number(b.list_amount),
    },
    {
      title: (
        <Tooltip title="Сумма строк чеков со скидкой строки. Скидка на чек и доставка сюда не входят.">
          Выручка
        </Tooltip>
      ),
      dataIndex: "revenue",
      width: 130,
      align: "right",
      render: (v: string) => <Money value={v} />,
      sorter: (a, b) => Number(a.revenue) - Number(b.revenue),
    },
    {
      title: (
        <Tooltip title="Итог чеков: строки минус скидка на чек плюс доставка. К товару не относится — поэтому только у клиента.">
          Сумма заказа
        </Tooltip>
      ),
      dataIndex: "order_total",
      width: 130,
      align: "right",
      render: (v: string | null, row) =>
        row.is_customer && v != null ? <Money value={v} /> : "—",
      defaultSortOrder: "descend",
      sorter: (a, b) => Number(a.order_total ?? a.revenue) - Number(b.order_total ?? b.revenue),
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
      width: 90,
      align: "right",
      render: (v: string | null) => fmtPct(v),
      sorter: (a, b) => Number(a.margin_pct ?? 0) - Number(b.margin_pct ?? 0),
    },
  ];

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>OLAP продажи</h2>

      <Space wrap style={{ marginBottom: 16 }}>
        <ReportRangePicker value={range} onChange={setRange} />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Все клиенты"
          style={{ width: 260 }}
          loading={customers.isPending}
          value={customerId}
          onChange={setCustomerId}
          options={customers.data?.map((c) => ({
            value: c.customer_id,
            label: c.name,
          }))}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Все прайс-листы"
          style={{ width: 240 }}
          loading={menus.isPending}
          value={menuId}
          onChange={setMenuId}
          options={menus.data?.map((m) => ({
            value: m.menu_id,
            label: m.is_default ? `${m.name} (основное)` : m.name,
          }))}
        />
        <Input.Search
          allowClear
          placeholder="Поиск по клиенту, товару или артикулу"
          style={{ width: 320 }}
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
              { key: "cust", label: "Клиентов", children: totals.customers },
              { key: "pos", label: "Позиций", children: totals.positions },
              { key: "qty", label: "Продано", children: fmtQty(totals.quantity) },
              { key: "checks", label: "Чеков", children: totals.check_count },
              {
                key: "base",
                label: "По ценам товаров",
                children: <Money value={totals.base_amount} />,
              },
              {
                key: "list",
                label: "По прейскуранту",
                children: <Money value={totals.list_amount} />,
              },
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
                key: "order",
                label: "Сумма заказов",
                children: (
                  <Tooltip title="Итог чеков: строки минус скидка на чек плюс доставка — совпадает с выручкой P&L">
                    <b>
                      <Money value={totals.order_total} />
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

      <Table<OlapSalesRow>
        rowKey="key"
        size="small"
        loading={query.isPending}
        dataSource={rows}
        columns={columns}
        pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (t) => `${t} клиентов` }}
        scroll={{ x: 1700 }}
        expandable={{
          expandedRowKeys: expandedKeys,
          onExpandedRowsChange: (keys) => setExpandedKeys(keys.map(String)),
          indentSize: 20,
        }}
        onRow={(row) => ({
          style: row.is_customer ? { fontWeight: 600, background: "#fafafa" } : undefined,
        })}
      />
    </div>
  );
}
