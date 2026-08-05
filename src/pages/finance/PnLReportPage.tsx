import { Alert, Card, DatePicker, Descriptions, Segmented, Space, Table, Tooltip, Typography } from "antd";
import type { DescriptionsProps } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import { fetchPnl, type PnLParams, type PnLReport } from "@/api/finance";
import { fmtDate, fmtMoney, Money } from "@/components/format";
import { fmtPct, paymentMethodLabel } from "@/pages/finance/labels";

type Mode = "month" | "range";

interface BreakdownRow {
  key: string;
  amount: string;
}

export default function PnLReportPage() {
  const [mode, setMode] = useState<Mode>("month");
  const [month, setMonth] = useState<Dayjs | null>(null);
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);

  let params: PnLParams | undefined;
  if (mode === "month" && month) {
    params = { year: month.year(), month: month.month() + 1 };
  } else if (mode === "range" && range) {
    params = { from: range[0].format("YYYY-MM-DD"), to: range[1].format("YYYY-MM-DD") };
  }

  const query = useQuery({
    queryKey: ["pnl", params],
    queryFn: () => fetchPnl(params as PnLParams),
    enabled: params != null,
  });

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Отчёт о прибылях и убытках (P&L)</h2>

      <Space wrap style={{ marginBottom: 16 }}>
        <Segmented
          value={mode}
          onChange={(v) => setMode(v as Mode)}
          options={[
            { value: "month", label: "Месяц" },
            { value: "range", label: "Диапазон" },
          ]}
        />
        {mode === "month" ? (
          <DatePicker
            picker="month"
            format="MMMM YYYY"
            placeholder="Выберите месяц"
            value={month}
            onChange={setMonth}
          />
        ) : (
          <DatePicker.RangePicker
            format="DD.MM.YYYY"
            placeholder={["Дата с", "Дата по"]}
            value={range}
            onChange={(v) => setRange(v && v[0] && v[1] ? [v[0], v[1]] : null)}
          />
        )}
      </Space>

      {params == null && (
        <Typography.Paragraph type="secondary">
          Выберите период, чтобы сформировать отчёт.
        </Typography.Paragraph>
      )}
      {query.isError && <Alert type="error" showIcon message={errorMessage(query.error)} />}
      {params != null && query.data && (
        <PnLView report={query.data} loading={query.isFetching} />
      )}
    </div>
  );
}

function PnLView({ report, loading }: { report: PnLReport; loading: boolean }) {
  const items: DescriptionsProps["items"] = [
    { key: "revenue", label: "Выручка", children: <Money value={report.revenue} /> },
    { key: "cogs", label: "Себестоимость", children: <Money value={report.cogs} /> },
    {
      key: "gross_profit",
      label: "Валовая прибыль",
      children: <Money value={report.gross_profit} />,
    },
    { key: "gross_margin", label: "Валовая маржа", children: fmtPct(report.gross_margin_pct) },
    { key: "opex", label: "Операционные расходы", children: <Money value={report.opex} /> },
    {
      key: "inventory_losses",
      label: "Потери склада",
      children: <Money value={report.inventory_losses} />,
    },
    {
      key: "staff_meals",
      label: "Питание сотрудников",
      children: (
        <Tooltip
          title={`Себестоимость съеденного. Из зарплат при этом удержится ${fmtMoney(
            report.staff_meals_withheld,
          )} — по ценам меню.`}
        >
          <Money value={report.staff_meals_cost} />
        </Tooltip>
      ),
    },
    {
      key: "net_profit",
      label: "Чистая прибыль",
      children: <b><Money value={report.net_profit} /></b>,
    },
    { key: "net_margin", label: "Чистая маржа", children: fmtPct(report.net_margin_pct) },
  ];

  const methodRows: BreakdownRow[] = Object.entries(report.revenue_by_method).map(
    ([key, amount]) => ({ key, amount }),
  );
  const categoryRows: BreakdownRow[] = Object.entries(report.opex_by_category).map(
    ([key, amount]) => ({ key, amount }),
  );

  const methodColumns: ColumnsType<BreakdownRow> = [
    { title: "Способ оплаты", dataIndex: "key", render: (k: string) => paymentMethodLabel(k) },
    {
      title: "Сумма",
      dataIndex: "amount",
      align: "right",
      render: (v: string) => <Money value={v} />,
    },
  ];
  const categoryColumns: ColumnsType<BreakdownRow> = [
    { title: "Статья", dataIndex: "key" },
    {
      title: "Сумма",
      dataIndex: "amount",
      align: "right",
      render: (v: string) => <Money value={v} />,
    },
  ];

  return (
    <Card
      loading={loading}
      title={`P&L за ${fmtDate(report.date_from)} — ${fmtDate(report.date_to)}`}
    >
      <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }} items={items} />

      <Typography.Title level={5} style={{ marginTop: 24 }}>
        Выручка по способам оплаты
      </Typography.Title>
      <Table
        rowKey="key"
        size="small"
        pagination={false}
        dataSource={methodRows}
        columns={methodColumns}
        summary={() =>
          methodRows.length > 0 ? (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}>
                <b>Итого</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right">
                <b>{fmtMoney(report.revenue)}</b>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          ) : null
        }
      />

      <Typography.Title level={5} style={{ marginTop: 24 }}>
        Расходы по статьям
      </Typography.Title>
      <Table
        rowKey="key"
        size="small"
        pagination={false}
        dataSource={categoryRows}
        columns={categoryColumns}
        summary={() =>
          categoryRows.length > 0 ? (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}>
                <b>Итого</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right">
                <b>{fmtMoney(report.opex)}</b>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          ) : null
        }
      />
    </Card>
  );
}
