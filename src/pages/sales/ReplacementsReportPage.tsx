/** /reports/replacements — журнал замен (cap report.read).
 *
 * Замена: клиент позвонил и попросил заменить позицию, и в следующем его заказе
 * оператор поставил галочку — товар ушёл бесплатно, но со склада списался. Здесь
 * видно, кому, что, когда и на какую сумму мы отдали.
 *
 * `waived_amount` — недополученная выручка (цена прайс-листа клиента на момент
 * выдачи). Себестоимость замены здесь не показывается: она выводится через
 * складской документ чека, у которого своя страница.
 */
import { Card, Col, DatePicker, Result, Row, Select, Space, Statistic, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  listAllCustomers,
  listReplacements,
  replacementsSummary,
  type ReplacementRow,
} from "@/api/sales";
import { useCan } from "@/auth/store";
import { Money, fmtDate, fmtMoney, fmtQty } from "@/components/format";
import { usePagination } from "@/components/usePagination";

const { RangePicker } = DatePicker;

export default function ReplacementsReportPage() {
  const canRead = useCan("report.read");
  const { limit, offset, tablePagination, reset } = usePagination();
  const [customer, setCustomer] = useState<number | undefined>(undefined);
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>([
    dayjs().startOf("month"),
    dayjs(),
  ]);

  const dateFrom = range?.[0]?.format("YYYY-MM-DD");
  const dateTo = range?.[1]?.format("YYYY-MM-DD");
  const filters = { customer, date_from: dateFrom, date_to: dateTo };

  const query = useQuery({
    queryKey: ["replacements", { ...filters, limit, offset }],
    queryFn: () => listReplacements({ ...filters, limit, offset }),
    enabled: canRead,
  });

  const summary = useQuery({
    queryKey: ["replacements-summary", filters],
    queryFn: () => replacementsSummary(filters),
    enabled: canRead,
  });

  const customers = useQuery({
    queryKey: ["customers-lookup", "replacements"],
    // Постранично: `limit: 500` бэкенд отклонял (le=200), фильтр по клиенту
    // оставался пустым.
    queryFn: () => listAllCustomers({ active: true }),
    staleTime: 60_000,
    enabled: canRead,
  });

  if (!canRead) {
    return <Result status="403" title="Недостаточно прав" subTitle="Нужно право report.read" />;
  }

  const columns: ColumnsType<ReplacementRow> = [
    {
      title: "Дата",
      dataIndex: "replacement_date",
      width: 110,
      render: (v: string) => fmtDate(v),
    },
    {
      title: "Клиент",
      dataIndex: "customer_name",
      render: (v: string, row) => <Link to={`/customers/${row.customer_id}`}>{v}</Link>,
    },
    { title: "Позиция", dataIndex: "menu_item_name" },
    {
      title: "Кол-во",
      dataIndex: "quantity",
      align: "right",
      width: 100,
      render: (v: string) => fmtQty(v),
    },
    {
      title: "Не оплачено",
      dataIndex: "waived_amount",
      align: "right",
      width: 140,
      render: (v: string) => <Money value={v} />,
    },
    {
      title: "Документы",
      width: 190,
      render: (_, row) => (
        <Space size={8}>
          {row.check_id != null && <Link to={`/checks/${row.check_id}`}>чек</Link>}
          {row.order_id != null && <span>заказ №{row.order_id}</span>}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }} wrap>
        <h2 style={{ margin: 0 }}>Замены</h2>
        <Space wrap>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Все клиенты"
            style={{ width: 280 }}
            loading={customers.isPending}
            value={customer}
            onChange={(v) => {
              setCustomer(v);
              reset();
            }}
            options={customers.data?.map((c) => ({
              value: c.customer_id,
              label: c.name,
            }))}
          />
          <RangePicker
            value={range}
            onChange={(v) => {
              setRange(v);
              reset();
            }}
          />
        </Space>
      </Space>

      {query.isError && (
        <Result
          status="error"
          title="Не удалось загрузить журнал"
          subTitle={errorMessage(query.error)}
        />
      )}

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} md={8}>
          <Card size="small" loading={summary.isPending}>
            <Statistic title="Замен выдано" value={summary.data?.count ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={8}>
          <Card size="small" loading={summary.isPending}>
            <Statistic title="Позиций" value={fmtQty(summary.data?.total_quantity)} />
          </Card>
        </Col>
        <Col xs={12} md={8}>
          <Card size="small" loading={summary.isPending}>
            <Statistic
              title="Недополучено выручки"
              value={fmtMoney(summary.data?.total_waived)}
            />
          </Card>
        </Col>
      </Row>

      <Table
        rowKey="replacement_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        pagination={tablePagination(query.data?.total)}
        columns={columns}
        locale={{ emptyText: "Замен за период нет" }}
      />
    </div>
  );
}
