/** Вкладка «Остатки» на странице складов: что сейчас лежит на складах.
 *
 * Эндпоинт отдаёт полный список без пагинации, поэтому фильтры и поиск считаются
 * на клиенте. Сверху — сводка: сколько позиций и на какую сумму лежит, и разбивка
 * по складам (пока склад не выбран). Количество показываем ВМЕСТЕ с базовой
 * единицей продукта — «4 700» без «г» ничего не значит.
 */
import { SearchOutlined } from "@ant-design/icons";
import {
  Card, Col, Input, Row, Select, Space, Statistic, Switch, Table, Tag, Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { listUnits } from "@/api/catalog";
import { fetchAllPages } from "@/api/client";
import { getStock, type StockRow } from "@/api/reports";
import { fmtMoney, fmtQty } from "@/components/format";
import {
  nameOf,
  useProductsLookup,
  useWarehousesLookup,
} from "@/pages/inventory/shared";

export default function StockTab() {
  const products = useProductsLookup();
  const warehouses = useWarehousesLookup();
  const [warehouseId, setWarehouseId] = useState<number | undefined>();
  const [productId, setProductId] = useState<number | undefined>();
  const [search, setSearch] = useState("");
  const [hideZero, setHideZero] = useState(true);

  const units = useQuery({
    queryKey: ["lookup", "units", "all"],
    queryFn: () => fetchAllPages((pg) => listUnits(pg)),
    staleTime: 60_000,
  });
  const unitById = useMemo(
    () => new Map((units.data ?? []).map((u) => [u.unit_id, u.name])),
    [units.data],
  );
  /** Базовая единица продукта: количество без неё нечитаемо. */
  const unitOf = (id: number) => {
    const p = products.byId.get(id);
    return p ? unitById.get(p.base_unit_id) ?? "" : "";
  };

  const query = useQuery({
    queryKey: ["stock", { warehouseId, productId }],
    queryFn: () => getStock({ warehouse_id: warehouseId, product_id: productId }),
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (query.data ?? []).filter((r) => {
      if (hideZero && Number(r.quantity) === 0) return false;
      if (!q) return true;
      return nameOf(products.byId, r.product_id).toLowerCase().includes(q);
    });
  }, [query.data, search, hideZero, products.byId]);

  const totals = useMemo(() => {
    const value = rows.reduce((sum, r) => sum + Number(r.cost_balance), 0);
    const negatives = rows.filter((r) => Number(r.quantity) < 0).length;
    return { positions: rows.length, value, negatives };
  }, [rows]);

  /** Сколько лежит на каждом складе — виден масштаб, пока склад не выбран. */
  const byWarehouse = useMemo(() => {
    const acc = new Map<number, { positions: number; value: number }>();
    for (const r of rows) {
      const cur = acc.get(r.warehouse_id) ?? { positions: 0, value: 0 };
      cur.positions += 1;
      cur.value += Number(r.cost_balance);
      acc.set(r.warehouse_id, cur);
    }
    return Array.from(acc.entries()).sort((a, b) => b[1].value - a[1].value);
  }, [rows]);

  const showWarehouse = warehouseId == null;

  const columns: ColumnsType<StockRow> = [];
  if (showWarehouse) {
    columns.push({
      title: "Склад",
      dataIndex: "warehouse_id",
      width: 200,
      render: (id: number) => nameOf(warehouses.byId, id),
    });
  }
  columns.push(
    {
      title: "Продукт",
      dataIndex: "product_id",
      render: (id: number) => nameOf(products.byId, id),
      sorter: (a, b) =>
        nameOf(products.byId, a.product_id).localeCompare(
          nameOf(products.byId, b.product_id),
        ),
    },
    {
      title: "Количество",
      dataIndex: "quantity",
      align: "right",
      width: 170,
      sorter: (a, b) => Number(a.quantity) - Number(b.quantity),
      render: (v: string, row) => (
        <span style={Number(v) < 0 ? { color: "#cf1322" } : undefined}>
          {fmtQty(v)} {unitOf(row.product_id)}
        </span>
      ),
    },
    {
      // Себестоимость одна на товар и не зависит от склада: в строках одного
      // продукта здесь всегда одно и то же число. Подсказка нужна, чтобы это не
      // читалось как «склады случайно совпали».
      title: (
        <Tooltip title="Одна на товар для всей организации — не зависит от склада">
          <span>Ср. себестоимость</span>
        </Tooltip>
      ),
      dataIndex: "avg_cost",
      align: "right",
      width: 190,
      sorter: (a, b) => Number(a.avg_cost) - Number(b.avg_cost),
      render: (v: string) => fmtMoney(v),
    },
    {
      // Стоимость по складу — раскладка общей стоимости товара по количеству.
      title: (
        <Tooltip title="Количество на складе × средняя себестоимость товара">
          <span>Стоимость</span>
        </Tooltip>
      ),
      dataIndex: "cost_balance",
      align: "right",
      width: 170,
      defaultSortOrder: "descend",
      sorter: (a, b) => Number(a.cost_balance) - Number(b.cost_balance),
      render: (v: string) => fmtMoney(v),
    },
  );

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={8}>
          <Card size="small" loading={query.isPending}>
            <Statistic title="Позиций" value={totals.positions} />
          </Card>
        </Col>
        <Col xs={12} md={8}>
          <Card size="small" loading={query.isPending}>
            <Statistic title="Стоимость запасов" value={fmtMoney(totals.value)} />
          </Card>
        </Col>
        <Col xs={12} md={8}>
          <Card size="small" loading={query.isPending}>
            <Statistic
              title="Минусовых остатков"
              value={totals.negatives}
              valueStyle={totals.negatives > 0 ? { color: "#cf1322" } : undefined}
            />
          </Card>
        </Col>
      </Row>

      {showWarehouse && byWarehouse.length > 1 && (
        <Card size="small" title="По складам" style={{ marginBottom: 16 }}>
          <Space wrap size={[8, 8]}>
            {byWarehouse.map(([id, agg]) => (
              <Tag
                key={id}
                style={{ cursor: "pointer", padding: "4px 10px", fontSize: 13 }}
                onClick={() => setWarehouseId(id)}
              >
                {nameOf(warehouses.byId, id)}: <b>{fmtMoney(agg.value)}</b>{" "}
                <span style={{ color: "#8c8c8c" }}>({agg.positions})</span>
              </Tag>
            ))}
          </Space>
        </Card>
      )}

      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Все склады"
          style={{ width: 240 }}
          options={warehouses.options}
          value={warehouseId}
          onChange={(v) => setWarehouseId(v)}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Все продукты"
          style={{ width: 260 }}
          loading={products.isPending}
          options={products.options}
          value={productId}
          onChange={(v) => setProductId(v)}
        />
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Поиск по названию"
          style={{ width: 220 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Space size={6}>
          <Switch checked={hideZero} onChange={setHideZero} />
          <span>Скрыть нулевые</span>
        </Space>
      </Space>

      <Table<StockRow>
        rowKey={(r) => `${r.warehouse_id}-${r.product_id}`}
        size="small"
        loading={query.isPending || products.isPending}
        dataSource={rows}
        columns={columns}
        pagination={{ pageSize: 50, showSizeChanger: true, hideOnSinglePage: true }}
      />
    </div>
  );
}
