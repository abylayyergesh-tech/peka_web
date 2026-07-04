/** /reports/stock — текущие остатки: продукт, количество, стоимость.
 *  Эндпоинт отдаёт полный список (без пагинации). */
import { Select, Space, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getStock, type StockRow } from "@/api/reports";
import { fmtMoney, fmtQty } from "@/components/format";
import {
  nameOf,
  useProductsLookup,
  useWarehousesLookup,
} from "@/pages/inventory/shared";

export default function StockReportPage() {
  const products = useProductsLookup();
  const warehouses = useWarehousesLookup();
  const [warehouseId, setWarehouseId] = useState<number | undefined>();
  const [productId, setProductId] = useState<number | undefined>();

  const query = useQuery({
    queryKey: ["stock", { warehouseId, productId }],
    queryFn: () =>
      getStock({ warehouse_id: warehouseId, product_id: productId }),
  });

  const showWarehouse = warehouseId == null;

  const columns: ColumnsType<StockRow> = [];
  if (showWarehouse) {
    columns.push({
      title: "Склад",
      dataIndex: "warehouse_id",
      render: (id: number) => nameOf(warehouses.byId, id),
    });
  }
  columns.push(
    {
      title: "Продукт",
      dataIndex: "product_id",
      render: (id: number) => nameOf(products.byId, id),
    },
    {
      title: "Количество",
      dataIndex: "quantity",
      align: "right",
      width: 160,
      render: (v: string) => fmtQty(v),
    },
    {
      title: "Ср. себестоимость",
      dataIndex: "avg_cost",
      align: "right",
      width: 170,
      render: (v: string) => fmtMoney(v),
    },
    {
      title: "Стоимость",
      dataIndex: "cost_balance",
      align: "right",
      width: 170,
      render: (v: string) => fmtMoney(v),
    },
  );

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Остатки</h2>
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
          options={products.options}
          value={productId}
          onChange={(v) => setProductId(v)}
        />
      </Space>

      <Table<StockRow>
        rowKey={(r) => `${r.warehouse_id}-${r.product_id}`}
        size="small"
        loading={query.isPending}
        dataSource={query.data}
        columns={columns}
        pagination={{ pageSize: 50, showSizeChanger: true, hideOnSinglePage: true }}
      />
    </div>
  );
}
