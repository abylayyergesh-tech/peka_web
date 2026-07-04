/** /reports/movements — журнал движений. Курсорная пагинация (CursorPage):
 *  кнопка «Показать ещё» вместо обычной постраничной навигации. */
import { Button, DatePicker, Select, Space, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";

import { getMovements, type MovementRow } from "@/api/reports";
import { fmtDate, fmtMoney, fmtQty } from "@/components/format";
import {
  nameOf,
  useProductsLookup,
  useWarehousesLookup,
} from "@/pages/inventory/shared";

const { RangePicker } = DatePicker;
const PAGE_SIZE = 50;

export default function MovementsReportPage() {
  const products = useProductsLookup();
  const warehouses = useWarehousesLookup();
  const [warehouseId, setWarehouseId] = useState<number | undefined>();
  const [productId, setProductId] = useState<number | undefined>();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);

  const from = range?.[0]?.format("YYYY-MM-DD");
  const to = range?.[1]?.format("YYYY-MM-DD");

  const query = useInfiniteQuery({
    queryKey: ["movements", { warehouseId, productId, from, to }],
    queryFn: ({ pageParam }) =>
      getMovements({
        warehouse_id: warehouseId,
        product_id: productId,
        from,
        to,
        cursor: pageParam ?? undefined,
        limit: PAGE_SIZE,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });

  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];

  const columns: ColumnsType<MovementRow> = [
    {
      title: "Дата",
      dataIndex: "doc_date",
      width: 110,
      render: (v: string) => fmtDate(v),
    },
    {
      title: "Продукт",
      dataIndex: "product_id",
      render: (id: number) => nameOf(products.byId, id),
    },
    {
      title: "Склад",
      dataIndex: "warehouse_id",
      render: (id: number) => nameOf(warehouses.byId, id),
    },
    {
      title: "Δ Кол-во",
      dataIndex: "quantity_delta",
      align: "right",
      width: 130,
      render: (v: string) => fmtQty(v),
    },
    {
      title: "Δ Стоимость",
      dataIndex: "cost_delta",
      align: "right",
      width: 140,
      render: (v: string) => fmtMoney(v),
    },
    {
      title: "Остаток",
      dataIndex: "quantity_after",
      align: "right",
      width: 130,
      render: (v: string) => fmtQty(v),
    },
    {
      title: "Ср. себест.",
      dataIndex: "avg_cost_after",
      align: "right",
      width: 140,
      render: (v: string) => fmtMoney(v),
    },
    {
      title: "Документ",
      dataIndex: "document_id",
      width: 110,
      render: (id: number) => <Link to={`/documents/${id}`}>№{id}</Link>,
    },
  ];

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Движения</h2>
      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Все склады"
          style={{ width: 220 }}
          options={warehouses.options}
          value={warehouseId}
          onChange={(v) => setWarehouseId(v)}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Все продукты"
          style={{ width: 240 }}
          options={products.options}
          value={productId}
          onChange={(v) => setProductId(v)}
        />
        <RangePicker
          format="DD.MM.YYYY"
          value={range}
          onChange={(v) => setRange(v as [Dayjs, Dayjs] | null)}
        />
      </Space>

      <Table<MovementRow>
        rowKey="id"
        size="small"
        loading={query.isPending}
        dataSource={rows}
        columns={columns}
        pagination={false}
      />

      <div style={{ textAlign: "center", marginTop: 16 }}>
        {query.hasNextPage ? (
          <Button
            onClick={() => query.fetchNextPage()}
            loading={query.isFetchingNextPage}
          >
            Показать ещё
          </Button>
        ) : (
          rows.length > 0 && <span style={{ color: "#999" }}>Больше записей нет</span>
        )}
      </div>
    </div>
  );
}
