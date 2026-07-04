/** /reports/product-cost — рекурсивная себестоимость (ProductCostNode).
 *  Требует и продукт, и склад (источник себестоимости листьев). Дерево
 *  показываем через Table с разворачиваемыми строками. */
import { Alert, Select, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import { getProductCost, type ProductCostNode } from "@/api/reports";
import { fmtMoney } from "@/components/format";
import {
  nameOf,
  useProductsLookup,
  useWarehousesLookup,
} from "@/pages/inventory/shared";

interface CostRow {
  key: string;
  product_id: number;
  cost_per_base_unit: string | null;
  missing_cost: boolean;
  children?: CostRow[];
}

function toRow(node: ProductCostNode, key: string): CostRow {
  return {
    key,
    product_id: node.product_id,
    cost_per_base_unit: node.cost_per_base_unit,
    missing_cost: node.missing_cost,
    children: node.components.length
      ? node.components.map((c, i) => toRow(c, `${key}.${i}`))
      : undefined,
  };
}

export default function ProductCostReportPage() {
  const products = useProductsLookup();
  const warehouses = useWarehousesLookup();
  const [productId, setProductId] = useState<number | undefined>();
  const [warehouseId, setWarehouseId] = useState<number | undefined>();

  const query = useQuery({
    queryKey: ["product-cost", { productId, warehouseId }],
    queryFn: () => getProductCost(productId as number, warehouseId as number),
    enabled: productId != null && warehouseId != null,
  });

  const rows = query.data ? [toRow(query.data, "0")] : [];

  const columns: ColumnsType<CostRow> = [
    {
      title: "Продукт",
      dataIndex: "product_id",
      render: (id: number) => nameOf(products.byId, id),
    },
    {
      title: "Себест. за ед.",
      dataIndex: "cost_per_base_unit",
      align: "right",
      width: 180,
      render: (v: string | null) => (v == null ? "—" : fmtMoney(v)),
    },
    {
      title: "Статус",
      dataIndex: "missing_cost",
      width: 180,
      render: (missing: boolean) =>
        missing ? (
          <Tag color="warning">Нет себестоимости</Tag>
        ) : (
          <Tag color="success">OK</Tag>
        ),
    },
  ];

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Себестоимость</h2>
      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="Продукт"
          style={{ width: 280 }}
          options={products.options}
          value={productId}
          onChange={(v) => setProductId(v)}
        />
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="Склад (источник себестоимости)"
          style={{ width: 280 }}
          options={warehouses.options}
          value={warehouseId}
          onChange={(v) => setWarehouseId(v)}
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

      {productId == null || warehouseId == null ? (
        <Alert type="info" showIcon message="Выберите продукт и склад." />
      ) : (
        <Table<CostRow>
          key={`${productId}-${warehouseId}`}
          rowKey="key"
          size="small"
          loading={query.isPending}
          dataSource={rows}
          columns={columns}
          pagination={false}
          expandable={{ defaultExpandAllRows: true }}
        />
      )}
    </div>
  );
}
