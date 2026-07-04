/** /reports/payables — supplier balances report (cap report.read). */
import { Alert, DatePicker, Select, Space, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { errorMessage } from "@/api/client";
import { reportPayables, type SupplierBalanceOut } from "@/api/procurement";
import { Money } from "@/components/format";
import { useSupplierRefs } from "@/pages/procurement/refData";

export default function PayablesReportPage() {
  const [asOf, setAsOf] = useState<Dayjs | null>(null);
  const [supplier, setSupplier] = useState<number | undefined>(undefined);
  const suppliers = useSupplierRefs();
  const asOfStr = asOf ? asOf.format("YYYY-MM-DD") : undefined;

  const query = useQuery({
    queryKey: ["payables", { as_of: asOfStr ?? null, supplier: supplier ?? null }],
    queryFn: () => reportPayables({ as_of: asOfStr, supplier }),
  });

  const columns: ColumnsType<SupplierBalanceOut> = [
    {
      title: "Поставщик",
      dataIndex: "supplier_name",
      render: (_, row) => <Link to={`/suppliers/${row.supplier_id}`}>{row.supplier_name}</Link>,
    },
    {
      title: "Баланс (задолженность)",
      dataIndex: "balance",
      width: 200,
      align: "right",
      render: (v: string) => <Money value={v} />,
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <h2 style={{ margin: 0 }}>Кредиторка</h2>
        <DatePicker
          placeholder="На дату"
          format="DD.MM.YYYY"
          value={asOf}
          onChange={(v) => setAsOf(v)}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Поставщик"
          style={{ width: 220 }}
          value={supplier}
          onChange={(v) => setSupplier(v)}
          options={suppliers.options}
          loading={suppliers.isPending}
        />
      </Space>
      {query.isError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={errorMessage(query.error)}
        />
      )}
      <Table
        rowKey="supplier_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data}
        pagination={false}
        columns={columns}
        summary={(rows) => {
          const total = rows.reduce((sum, r) => sum + Number(r.balance), 0);
          return (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}>
                <b>Итого</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right">
                <b>
                  <Money value={total} />
                </b>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          );
        }}
      />
    </div>
  );
}
