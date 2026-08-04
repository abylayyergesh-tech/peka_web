/** /reports/abc — ABC-анализ товаров: что кормит, а что балласт.
 *
 *  Позиции выстраиваются по убыванию метрики, и класс задаётся накопленной долей:
 *  A — верхушка, дающая первые 80 % итога, B — до 95 %, C — остальное. Метрика на
 *  выбор: выручка, прибыль или количество — по прибыли картина часто другая, чем
 *  по выручке, и именно она интересна. */
import { Alert, Card, Segmented, Space, Table, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import { fetchAbc, type AbcMetric, type AbcRow } from "@/api/finance";
import { fmtDate, fmtQty, Money } from "@/components/format";
import { fmtPct } from "@/pages/finance/labels";
import { ReportRangePicker, useReportRange } from "@/pages/finance/reportRange";

const METRIC_LABELS: Record<AbcMetric, string> = {
  revenue: "Выручка",
  profit: "Прибыль",
  quantity: "Количество",
};

const CLASS_COLORS: Record<string, string> = { A: "green", B: "gold", C: "default" };

const CLASS_HINTS: Record<string, string> = {
  A: "Кормит бизнес: следить за наличием, ценой и качеством в первую очередь",
  B: "Середина: держать, но без фанатизма",
  C: "Балласт: занимает место в меню и на складе, а даёт мало",
};

export default function AbcReportPage() {
  const { range, setRange, params } = useReportRange();
  const [metric, setMetric] = useState<AbcMetric>("revenue");

  const query = useQuery({
    queryKey: ["abc", params, metric],
    queryFn: () => fetchAbc({ ...params, metric }),
  });

  const isMoney = metric !== "quantity";
  const metricCell = (v: string) => (isMoney ? <Money value={v} /> : fmtQty(v));

  const columns: ColumnsType<AbcRow> = [
    {
      title: "Класс",
      dataIndex: "abc_class",
      width: 90,
      render: (c: string) => (
        <Tooltip title={CLASS_HINTS[c]}>
          <Tag color={CLASS_COLORS[c]}>{c}</Tag>
        </Tooltip>
      ),
      filters: [
        { text: "A", value: "A" },
        { text: "B", value: "B" },
        { text: "C", value: "C" },
      ],
      onFilter: (value, row) => row.abc_class === value,
    },
    { title: "Артикул", dataIndex: "sku", width: 100, render: (v) => v ?? "—" },
    { title: "Товар", dataIndex: "name" },
    {
      title: METRIC_LABELS[metric],
      dataIndex: "metric_value",
      width: 140,
      align: "right",
      render: metricCell,
    },
    {
      title: "Доля",
      dataIndex: "share_pct",
      width: 100,
      align: "right",
      render: (v: string) => fmtPct(v),
    },
    {
      title: "Накопленно",
      dataIndex: "cumulative_pct",
      width: 120,
      align: "right",
      render: (v: string) => fmtPct(v),
    },
    {
      title: "Продано",
      dataIndex: "quantity",
      width: 100,
      align: "right",
      render: (v: string) => fmtQty(v),
    },
    {
      title: "Выручка",
      dataIndex: "revenue",
      width: 130,
      align: "right",
      render: (v: string) => <Money value={v} />,
    },
    {
      title: "Прибыль",
      dataIndex: "profit",
      width: 130,
      align: "right",
      render: (v: string, row) => (
        <>
          <Money value={v} />
          {row.cost_missing && (
            <Tooltip title="Себестоимость не посчитана — прибыль завышена">
              <Tag color="warning" style={{ marginInlineStart: 6 }}>
                ?
              </Tag>
            </Tooltip>
          )}
        </>
      ),
    },
    {
      title: "Маржа",
      dataIndex: "margin_pct",
      width: 100,
      align: "right",
      render: (v: string | null) => fmtPct(v),
    },
  ];

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>ABC-анализ товаров</h2>

      <Space wrap style={{ marginBottom: 16 }}>
        <ReportRangePicker value={range} onChange={setRange} />
        <Segmented
          value={metric}
          onChange={(v) => setMetric(v as AbcMetric)}
          options={(Object.keys(METRIC_LABELS) as AbcMetric[]).map((m) => ({
            value: m,
            label: METRIC_LABELS[m],
          }))}
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

      {query.data && (
        <>
          <Space wrap size={16} style={{ marginBottom: 16 }}>
            {query.data.classes.map((c) => (
              <Card key={c.abc_class} size="small" style={{ minWidth: 220 }}>
                <Space align="start">
                  <Tag color={CLASS_COLORS[c.abc_class]} style={{ fontSize: 16 }}>
                    {c.abc_class}
                  </Tag>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 600 }}>
                      {isMoney ? <Money value={c.metric_value} /> : fmtQty(c.metric_value)}
                    </div>
                    <div style={{ color: "#8c8c8c", fontSize: 13 }}>
                      {c.positions} позиций · {fmtPct(c.share_pct)}
                    </div>
                    <div style={{ color: "#8c8c8c", fontSize: 13 }}>
                      прибыль <Money value={c.profit} />
                    </div>
                  </div>
                </Space>
              </Card>
            ))}
          </Space>

          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message={
              `Период ${fmtDate(query.data.date_from)} — ${fmtDate(query.data.date_to)}. ` +
              `Границы классов: A до ${fmtPct(query.data.a_pct)}, B до ${fmtPct(query.data.b_pct)} ` +
              `накопленной доли. Позиции с нулевой или отрицательной метрикой — сразу C.`
            }
          />

          <Table<AbcRow>
            rowKey="product_id"
            size="small"
            loading={query.isFetching}
            dataSource={query.data.rows}
            columns={columns}
            pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (t) => `${t} позиций` }}
            scroll={{ x: 1400 }}
          />
        </>
      )}
    </div>
  );
}
