/** Supplier ledger tab (cap report.read): cursor pagination via "show more". */
import { Alert, Button, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useInfiniteQuery } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import { supplierLedger, type PayableEntryOut } from "@/api/procurement";
import { fmtDate, Money } from "@/components/format";
import { LEDGER_SOURCE_LABELS } from "@/pages/procurement/statuses";

export default function SupplierLedgerTab({ supplierId }: { supplierId: number }) {
  const query = useInfiniteQuery({
    queryKey: ["supplier-ledger", supplierId],
    queryFn: ({ pageParam }) => supplierLedger(supplierId, { after_seq: pageParam, limit: 50 }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.next_after_seq ?? undefined,
  });

  if (query.isError) {
    return <Alert type="error" showIcon message={errorMessage(query.error)} />;
  }

  const entries = query.data?.pages.flatMap((p) => p.items) ?? [];

  const columns: ColumnsType<PayableEntryOut> = [
    { title: "Дата", dataIndex: "entry_date", width: 110, render: (v) => fmtDate(v) },
    {
      title: "Операция",
      dataIndex: "source_type",
      render: (v: PayableEntryOut["source_type"], row) =>
        `${LEDGER_SOURCE_LABELS[v] ?? v} #${row.source_id}`,
    },
    {
      title: "Сумма",
      dataIndex: "amount_delta",
      width: 150,
      align: "right",
      render: (v: string) => (
        <span style={{ color: Number(v) > 0 ? "#cf1322" : "#3f8600" }}>
          <Money value={v} />
        </span>
      ),
    },
    {
      title: "Баланс после",
      dataIndex: "balance_after",
      width: 150,
      align: "right",
      render: (v: string) => <Money value={v} />,
    },
  ];

  return (
    <div>
      <Table
        rowKey="id"
        size="small"
        loading={query.isPending}
        dataSource={entries}
        pagination={false}
        columns={columns}
      />
      {query.hasNextPage && (
        <Button
          style={{ marginTop: 16 }}
          loading={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          Показать ещё
        </Button>
      )}
    </div>
  );
}
