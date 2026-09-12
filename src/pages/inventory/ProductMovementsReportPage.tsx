/** /reports/product-movements — карточка сырья: что с товаром было за период.

 *  В отличие от журнала «Движения по складу» здесь один продукт обязателен, и
 *  каждая проводка подписана: тип документа, номер, куда ушло / откуда пришло,
 *  расход и приход отдельно, остаток штук и денег. Новые сверху, как в iiko. */
import { Alert, Button, Checkbox, Empty, Select, Space, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { listUnits } from "@/api/catalog";
import { errorMessage, fetchAllPages } from "@/api/client";
import { getProductMovements, type MovementRow } from "@/api/reports";
import { fmtDate, fmtDateTime, fmtMoney, fmtQty } from "@/components/format";
import { ReportRangePicker, useReportRange } from "@/pages/finance/reportRange";
import {
  documentPath,
  nameOf,
  useProductsLookup,
  useWarehousesLookup,
} from "@/pages/inventory/shared";

const DOC_LABELS: Record<string, string> = {
  receipt: "Приходная накладная",
  write_off: "Акт списания",
  transfer: "Перемещение",
  production: "Акт приготовления",
  sale: "Акт реализации",
  inventory_count: "Инвентаризация",
};

function absQty(value: string): string {
  const n = Number(value);
  if (!n) return "";
  return fmtQty(Math.abs(n));
}

function absMoney(value: string): string {
  const n = Number(value);
  if (!n) return "—";
  return fmtMoney(Math.abs(n));
}

export default function ProductMovementsReportPage() {
  const [url, setUrl] = useSearchParams();
  const products = useProductsLookup();
  const warehouses = useWarehousesLookup();
  const urlFrom = url.get("from");
  const urlTo = url.get("to");
  const { range, setRange, params: period } = useReportRange(
    urlFrom && urlTo ? [dayjs(urlFrom), dayjs(urlTo)] : undefined,
  );
  const [colorOn, setColorOn] = useState(true);

  const productId = Number(url.get("product_id")) || undefined;
  const warehouseId = Number(url.get("warehouse_id")) || undefined;

  const patchUrl = (next: {
    product_id?: number | null;
    warehouse_id?: number | null;
  }) => {
    const copy = new URLSearchParams(url);
    if ("product_id" in next) {
      if (next.product_id) copy.set("product_id", String(next.product_id));
      else copy.delete("product_id");
    }
    if ("warehouse_id" in next) {
      if (next.warehouse_id) copy.set("warehouse_id", String(next.warehouse_id));
      else copy.delete("warehouse_id");
    }
    setUrl(copy, { replace: true });
  };

  const units = useQuery({
    queryKey: ["lookup", "units", "all"],
    queryFn: () => fetchAllPages((pg) => listUnits(pg)),
    staleTime: 60_000,
  });
  const unitLabel = useMemo(() => {
    if (productId == null) return "";
    const product = products.byId.get(productId);
    if (!product) return "";
    return (
      units.data?.find((u) => u.unit_id === product.base_unit_id)?.name ?? ""
    );
  }, [productId, products.byId, units.data]);

  const query = useQuery({
    queryKey: ["product-movements", { productId, warehouseId, ...period }],
    queryFn: () =>
      getProductMovements({
        product_id: productId as number,
        warehouse_id: warehouseId,
        from: period.from,
        to: period.to,
      }),
    enabled: productId != null,
  });

  const rows = query.data?.items ?? [];
  const productName =
    productId != null ? nameOf(products.byId, productId) : "";

  const columns: ColumnsType<MovementRow> = [
    {
      title: "Тип документа",
      dataIndex: "document_type",
      width: 190,
      render: (type: string | null | undefined) =>
        type ? (DOC_LABELS[type] ?? type) : "—",
    },
    {
      title: "Дата",
      key: "when",
      width: 150,
      render: (_, row) =>
        row.posted_at ? fmtDateTime(row.posted_at) : fmtDate(row.doc_date),
    },
    {
      title: "Номер документа",
      dataIndex: "document_number",
      width: 130,
      render: (number: number | null | undefined, row) => (
        <Link to={documentPath(row.document_type, row.document_id)}>
          {number ?? row.document_id}
        </Link>
      ),
    },
    {
      title: "Корреспонденция",
      dataIndex: "correspondence",
      render: (v: string | null | undefined) => v || "—",
    },
    {
      title: "Товар",
      dataIndex: "product_id",
      width: 220,
      render: (id: number) => nameOf(products.byId, id),
    },
    {
      title: "Склад",
      dataIndex: "warehouse_id",
      width: 180,
      render: (id: number) => nameOf(warehouses.byId, id),
    },
    {
      title: unitLabel ? `Расход, ${unitLabel}` : "Расход",
      dataIndex: "quantity_delta",
      align: "right",
      width: 130,
      render: (v: string) => (Number(v) < 0 ? absQty(v) : ""),
    },
    {
      title: unitLabel ? `Приход, ${unitLabel}` : "Приход",
      dataIndex: "quantity_delta",
      key: "qty_in",
      align: "right",
      width: 130,
      render: (v: string) => (Number(v) > 0 ? absQty(v) : ""),
    },
    {
      title: unitLabel ? `Остаток, ${unitLabel}` : "Остаток",
      dataIndex: "quantity_after",
      align: "right",
      width: 130,
      render: (v: string) => fmtQty(v),
    },
    {
      title: "Себестоимость за ед.",
      dataIndex: "avg_cost_after",
      align: "right",
      width: 160,
      render: (v: string) => fmtMoney(v),
    },
    {
      title: "Стоимость",
      dataIndex: "cost_delta",
      align: "right",
      width: 130,
      render: (v: string) => absMoney(v),
    },
    {
      // Деньги по этому складу: количество здесь × средняя товара.
      // `cost_balance_after` в журнале — кошелёк по всей организации, и после
      // перемещения обе стороны показали бы одну и ту же сумму.
      title: "Остаток стоимости",
      key: "wh_cost_after",
      align: "right",
      width: 150,
      render: (_, row) => {
        const qty = Number(row.quantity_after);
        const avg = Number(row.avg_cost_after);
        if (Number.isNaN(qty) || Number.isNaN(avg)) return "—";
        return fmtMoney(qty * avg);
      },
    },
  ];

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Движение товара</h2>

      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="Продукт"
          style={{ width: 320 }}
          loading={products.isPending}
          options={products.options}
          value={productId}
          onChange={(v) => patchUrl({ product_id: v ?? null })}
          allowClear
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Все склады"
          style={{ width: 240 }}
          options={warehouses.options}
          value={warehouseId}
          onChange={(v) => patchUrl({ warehouse_id: v ?? null })}
        />
        <ReportRangePicker value={range} onChange={setRange} />
        <Checkbox
          checked={colorOn}
          onChange={(e) => setColorOn(e.target.checked)}
        >
          Цветовая индикация
        </Checkbox>
        <Button
          onClick={() => query.refetch()}
          loading={query.isFetching}
          disabled={productId == null}
        >
          Обновить
        </Button>
      </Space>

      {query.isError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message={errorMessage(query.error)}
        />
      )}

      {query.data?.truncated && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={`Показаны последние ${query.data.limit} проводок. Сузьте период, чтобы увидеть более ранние.`}
        />
      )}

      {productId == null ? (
        <Empty
          description="Выберите товар — отчёт покажет каждое движение: приход, расход и остаток"
        />
      ) : (
        <Table<MovementRow>
          rowKey="stock_movement_id"
          size="small"
          loading={query.isPending}
          dataSource={rows}
          columns={columns}
          scroll={{ x: 1600 }}
          locale={{
            emptyText: productName
              ? `За период у «${productName}» движений не было`
              : "За период движений не было",
          }}
          pagination={{
            pageSize: 100,
            showSizeChanger: true,
            pageSizeOptions: [50, 100, 200],
            showTotal: (t) => `Проводок: ${t}`,
          }}
          onRow={(row) => {
            if (!colorOn) return {};
            const qty = Number(row.quantity_delta);
            if (qty > 0) return { style: { background: "#f6ffed" } };
            if (qty < 0) return { style: { background: "#fff1f0" } };
            return {};
          }}
        />
      )}
    </div>
  );
}
