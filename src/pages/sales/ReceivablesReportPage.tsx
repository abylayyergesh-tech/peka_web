/** /reports/receivables — customer receivable balances (cap report.read). */
import { DatePicker, Result, Space, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import { reportReceivables, type CustomerBalanceOut } from "@/api/sales";
import { useCan } from "@/auth/store";
import { Money } from "@/components/format";

export default function ReceivablesReportPage() {
  const canRead = useCan("report.read");
  const [asOf, setAsOf] = useState<Dayjs | null>(null);
  const asOfStr = asOf?.format("YYYY-MM-DD");

  const query = useQuery({
    queryKey: ["receivables-report", { asOf: asOfStr }],
    queryFn: () => reportReceivables({ as_of: asOfStr }),
    enabled: canRead,
  });

  if (!canRead) {
    return <Result status="403" title="Недостаточно прав" subTitle="Нужно право report.read" />;
  }
  if (query.isError) {
    return (
      <Result status="error" title="Не удалось загрузить отчёт" subTitle={errorMessage(query.error)} />
    );
  }

  const columns: ColumnsType<CustomerBalanceOut> = [
    {
      title: "Клиент",
      dataIndex: "customer_name",
      render: (v: string, row) => <Link to={`/customers/${row.customer_id}`}>{v}</Link>,
    },
    {
      title: "Долг",
      dataIndex: "balance",
      align: "right",
      width: 200,
      render: (v: string) => (
        <span style={{ color: Number(v) > 0 ? "#cf1322" : undefined }}>
          <Money value={v} />
        </span>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <h2 style={{ margin: 0 }}>Дебиторская задолженность</h2>
        <DatePicker
          placeholder="На дату"
          allowClear
          value={asOf}
          onChange={(v) => setAsOf(v)}
          format="DD.MM.YYYY"
        />
      </Space>
      <Table
        rowKey="customer_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data}
        columns={columns}
        pagination={{ pageSize: 20, showTotal: (t) => `Всего: ${t}` }}
        locale={{ emptyText: "Задолженностей нет" }}
      />
    </div>
  );
}
