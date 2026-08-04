/** /reports/cash-flow — движение денег: сколько пришло, сколько ушло, сколько осталось.
 *
 *  Это отчёт про ДЕНЬГИ, а не про прибыль, и путать их нельзя: продажа в долг
 *  прибыль даёт сразу, а деньги — только когда клиент заплатит; полученный товар
 *  ложится в себестоимость, а деньги уходят при оплате поставщику. Поэтому итог
 *  здесь с P&L не сходится и не должен. */
import { Alert, Card, Space, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useQuery } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import { fetchCashFlow, type CashFlowDay, type CashFlowLine } from "@/api/finance";
import { fmtDate, fmtMoney, Money } from "@/components/format";
import { ReportRangePicker, useReportRange } from "@/pages/finance/reportRange";

const lineColumns = (totalLabel: string): ColumnsType<CashFlowLine> => [
  { title: totalLabel, dataIndex: "label" },
  {
    title: "Сумма",
    dataIndex: "amount",
    width: 160,
    align: "right",
    render: (v: string) => <Money value={v} />,
  },
];

export default function CashFlowPage() {
  const { range, setRange, params } = useReportRange();
  const query = useQuery({
    queryKey: ["cash-flow", params],
    queryFn: () => fetchCashFlow(params),
  });
  const data = query.data;

  const dayColumns: ColumnsType<CashFlowDay> = [
    { title: "День", dataIndex: "day", width: 140, render: (v: string) => fmtDate(v) },
    {
      title: "Пришло",
      dataIndex: "inflow",
      align: "right",
      render: (v: string) => <Money value={v} />,
    },
    {
      title: "Ушло",
      dataIndex: "outflow",
      align: "right",
      render: (v: string) => <Money value={v} />,
    },
    {
      title: "Итог дня",
      dataIndex: "net",
      align: "right",
      render: (v: string) => (
        <b style={{ color: Number(v) < 0 ? "#cf1322" : "#389e0d" }}>{fmtMoney(v)}</b>
      ),
    },
  ];

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Движение денег</h2>

      <Space wrap style={{ marginBottom: 16 }}>
        <ReportRangePicker value={range} onChange={setRange} />
      </Space>

      {query.isError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message={errorMessage(query.error)}
        />
      )}

      {data && (
        <>
          <Space wrap size={16} style={{ marginBottom: 16 }}>
            <Figure label="Пришло" value={data.inflow_total} color="#389e0d" />
            <Figure label="Ушло" value={data.outflow_total} color="#cf1322" />
            <Figure
              label="Осталось"
              value={data.net}
              color={Number(data.net) < 0 ? "#cf1322" : undefined}
              hint="Приход минус расход за выбранный период. Это не остаток на счетах: отчёт считает движение за период, а не сальдо."
            />
          </Space>

          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="Деньги, а не прибыль"
            description="Продажи в долг сюда не попадают — только платежи клиентов по ним. Приход товара учитывается при оплате поставщику, зарплата — при выплате. Поэтому с P&L этот отчёт не сходится."
          />

          <Space align="start" wrap size={16} style={{ display: "flex" }}>
            <Card
              size="small"
              title="Откуда пришли деньги"
              style={{ minWidth: 380, flex: 1 }}
              loading={query.isFetching}
            >
              <Table<CashFlowLine>
                rowKey={(r) => `${r.source}:${r.label}`}
                size="small"
                pagination={false}
                dataSource={data.inflow}
                columns={lineColumns("Источник")}
                locale={{ emptyText: "Денег не приходило" }}
                summary={() =>
                  data.inflow.length > 0 ? (
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0}>
                        <b>Итого</b>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={1} align="right">
                        <b>{fmtMoney(data.inflow_total)}</b>
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  ) : null
                }
              />
            </Card>

            <Card
              size="small"
              title="Куда ушли деньги"
              style={{ minWidth: 380, flex: 1 }}
              loading={query.isFetching}
            >
              <Table<CashFlowLine>
                rowKey={(r) => `${r.source}:${r.label}`}
                size="small"
                pagination={false}
                dataSource={data.outflow}
                columns={lineColumns("Направление")}
                locale={{ emptyText: "Денег не уходило" }}
                summary={() =>
                  data.outflow.length > 0 ? (
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0}>
                        <b>Итого</b>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={1} align="right">
                        <b>{fmtMoney(data.outflow_total)}</b>
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  ) : null
                }
              />
            </Card>
          </Space>

          <Typography.Title level={5} style={{ marginTop: 24 }}>
            По дням
          </Typography.Title>
          <Table<CashFlowDay>
            rowKey="day"
            size="small"
            loading={query.isFetching}
            dataSource={data.by_day}
            columns={dayColumns}
            pagination={false}
            locale={{ emptyText: "За период движений не было" }}
          />
        </>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  color,
  hint,
}: {
  label: string;
  value: string;
  color?: string;
  hint?: string;
}) {
  return (
    <Card size="small" style={{ minWidth: 220 }} title={label}>
      <div style={{ fontSize: 22, fontWeight: 600, color }}>{fmtMoney(value)}</div>
      {hint && (
        <div style={{ color: "#8c8c8c", fontSize: 12, marginTop: 4 }}>{hint}</div>
      )}
    </Card>
  );
}
