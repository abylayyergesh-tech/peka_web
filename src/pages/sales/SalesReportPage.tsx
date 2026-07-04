/** /reports/sales — sales report for a period (cap report.read):
 * totals + payment-method breakdown from SalesReport. */
import { Card, Col, DatePicker, Result, Row, Space, Statistic, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import { reportSales } from "@/api/sales";
import { useCan } from "@/auth/store";
import { Money, fmtMoney } from "@/components/format";
import { paymentMethodLabel } from "@/pages/sales/statusTags";

const { RangePicker } = DatePicker;

interface MethodRow {
  method: string;
  amount: string;
}

export default function SalesReportPage() {
  const canRead = useCan("report.read");
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>([
    dayjs().startOf("month"),
    dayjs(),
  ]);

  const dateFrom = range?.[0]?.format("YYYY-MM-DD");
  const dateTo = range?.[1]?.format("YYYY-MM-DD");

  const query = useQuery({
    queryKey: ["sales-report", { dateFrom, dateTo }],
    queryFn: () => reportSales({ date_from: dateFrom, date_to: dateTo }),
    enabled: canRead,
  });

  if (!canRead) {
    return <Result status="403" title="Недостаточно прав" subTitle="Нужно право report.read" />;
  }

  const methodRows: MethodRow[] = Object.entries(query.data?.by_method ?? {}).map(
    ([method, amount]) => ({ method, amount }),
  );

  const methodColumns: ColumnsType<MethodRow> = [
    { title: "Способ оплаты", dataIndex: "method", render: (v: string) => paymentMethodLabel(v) },
    {
      title: "Сумма",
      dataIndex: "amount",
      align: "right",
      render: (v: string) => <Money value={v} />,
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <h2 style={{ margin: 0 }}>Отчёт по продажам</h2>
        <RangePicker value={range} onChange={(v) => setRange(v)} />
      </Space>

      {query.isError && (
        <Result status="error" title="Не удалось загрузить отчёт" subTitle={errorMessage(query.error)} />
      )}

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small" loading={query.isPending}>
            <Statistic title="Чеков" value={query.data?.check_count ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" loading={query.isPending}>
            <Statistic title="Продажи (до скидок)" value={fmtMoney(query.data?.gross)} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" loading={query.isPending}>
            <Statistic title="Скидки" value={fmtMoney(query.data?.discount_total)} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" loading={query.isPending}>
            <Statistic title="Выручка" value={fmtMoney(query.data?.revenue)} />
          </Card>
        </Col>
      </Row>

      <Card title="Разбивка по способам оплаты" size="small">
        <Table
          rowKey="method"
          size="small"
          loading={query.isPending}
          dataSource={methodRows}
          pagination={false}
          columns={methodColumns}
          locale={{ emptyText: "Оплат за период нет" }}
        />
      </Card>
    </div>
  );
}
