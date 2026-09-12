/** /delivery/logs — куда, кто, что доставлял. */
import { Alert, DatePicker, Input, Select, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  listCouriers,
  listDeliveryLogs,
  type DeliveryLogRow,
  type StopStatus,
} from "@/api/delivery";
import { fmtDateTime } from "@/components/format";
import { itemsLine } from "@/pages/delivery/points";

const STOP_STATUS: Record<StopStatus, { label: string; color: string }> = {
  pending: { label: "Ждёт", color: "default" },
  delivered: { label: "Доставлено", color: "success" },
  failed: { label: "Не отдали", color: "error" },
};

export default function DeliveryLogsPage() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(7, "day"),
    dayjs(),
  ]);
  const [courier, setCourier] = useState<number | undefined>();
  const [status, setStatus] = useState<StopStatus | undefined>();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");

  const dateFrom = range[0].format("YYYY-MM-DD");
  const dateTo = range[1].format("YYYY-MM-DD");

  const couriers = useQuery({
    queryKey: ["delivery", "couriers"],
    queryFn: listCouriers,
    staleTime: 60_000,
  });

  const logs = useQuery({
    queryKey: ["delivery", "logs", dateFrom, dateTo, courier, status, search],
    queryFn: () =>
      listDeliveryLogs({
        date_from: dateFrom,
        date_to: dateTo,
        courier,
        status,
        q: search || undefined,
      }),
  });

  const columns: ColumnsType<DeliveryLogRow> = useMemo(
    () => [
      {
        title: "Когда",
        dataIndex: "delivered_at",
        width: 160,
        render: (v: string | null, row) =>
          v ? fmtDateTime(v) : dayjs(row.route_date).format("DD.MM.YYYY"),
      },
      {
        title: "Куда",
        dataIndex: "delivery_address",
        render: (v: string | null, row) => (
          <>
            <div>{v ?? "—"}</div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.customer_name ?? "—"}
              {row.order_number != null ? ` · №${row.order_number}` : ""}
              {row.is_extra ? " · доп." : ""}
            </Typography.Text>
          </>
        ),
      },
      {
        title: "Кто",
        dataIndex: "courier_name",
        width: 180,
        render: (v: string | null) => v ?? "—",
      },
      {
        title: "Что",
        dataIndex: "items",
        render: (items: DeliveryLogRow["items"]) => (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {itemsLine(items)}
          </Typography.Text>
        ),
      },
      {
        title: "Статус",
        dataIndex: "status",
        width: 140,
        render: (v: StopStatus, row) => (
          <>
            <Tag color={STOP_STATUS[v].color}>{STOP_STATUS[v].label}</Tag>
            {row.note && (
              <div style={{ fontSize: 12, color: "#8c8c8c" }}>{row.note}</div>
            )}
          </>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <Space wrap style={{ marginBottom: 12 }} align="center">
        <h2 style={{ margin: 0 }}>Журнал доставок</h2>
        <DatePicker.RangePicker
          value={range}
          onChange={(v) => v?.[0] && v[1] && setRange([v[0], v[1]])}
          format="DD.MM.YYYY"
          allowClear={false}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Все курьеры"
          style={{ width: 220 }}
          loading={couriers.isPending}
          value={courier}
          onChange={setCourier}
          options={(couriers.data ?? []).map((c) => ({
            value: c.employee_id,
            label: c.full_name,
          }))}
        />
        <Select
          allowClear
          placeholder="Любой статус"
          style={{ width: 160 }}
          value={status}
          onChange={setStatus}
          options={Object.entries(STOP_STATUS).map(([value, s]) => ({
            value,
            label: s.label,
          }))}
        />
        <Input.Search
          allowClear
          placeholder="Адрес, клиент, блюдо, маршрут"
          style={{ width: 280 }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onSearch={(v) => setSearch(v.trim())}
        />
      </Space>
      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        Куда везли, кто из курьеров, что в заказе и чем кончилось.
      </Typography.Paragraph>

      {logs.isError && (
        <Alert type="error" showIcon message={errorMessage(logs.error)} />
      )}

      <Table<DeliveryLogRow>
        rowKey="delivery_stop_id"
        size="small"
        loading={logs.isPending}
        dataSource={logs.data}
        columns={columns}
        pagination={{ pageSize: 50, showSizeChanger: true }}
      />
    </div>
  );
}
