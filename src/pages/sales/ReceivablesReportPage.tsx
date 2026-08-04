/** /reports/receivables — customer receivable balances (cap report.read).
 *
 * Поиск и сортировка — на клиенте, а не запросом: эндпоинт отдаёт весь список
 * сразу (без пагинации), это несколько сотен строк. Фильтровать их в браузере
 * мгновенно, а лишний round-trip на каждую букву ничего не улучшил бы.
 */
import { SearchOutlined } from "@ant-design/icons";
import { DatePicker, Input, Result, Space, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import { reportReceivables, type CustomerBalanceOut } from "@/api/sales";
import { useCan } from "@/auth/store";
import { Money } from "@/components/format";

/** Регистр и «ё» не должны мешать поиску: «пекарня» находит «Пекарню», а
 *  «елка» — «Ёлку». */
function normalize(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е");
}

/** Сумма денег из строк-Decimal.
 *
 * Складываем целые копейки, а не float'ы: на пяти сотнях балансов обычное
 * сложение чисел с плавающей точкой уводит итог на копейки, и «Итого» перестаёт
 * сходиться с суммой столбца глазами. */
function sumMoney(values: string[]): number {
  const cents = values.reduce((acc, v) => acc + Math.round(Number(v) * 100), 0);
  return cents / 100;
}

export default function ReceivablesReportPage() {
  const canRead = useCan("report.read");
  const [asOf, setAsOf] = useState<Dayjs | null>(null);
  const [search, setSearch] = useState("");
  const asOfStr = asOf?.format("YYYY-MM-DD");

  const query = useQuery({
    queryKey: ["receivables-report", { asOf: asOfStr }],
    queryFn: () => reportReceivables({ as_of: asOfStr }),
    enabled: canRead,
  });

  const rows = useMemo(() => {
    const needle = normalize(search.trim());
    const all = query.data ?? [];
    return needle ? all.filter((r) => normalize(r.customer_name).includes(needle)) : all;
  }, [query.data, search]);

  const total = useMemo(() => sumMoney(rows.map((r) => r.balance)), [rows]);

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
      // Сравниваем числами: balance приходит строкой-Decimal, и лексикографически
      // «9 000» оказалось бы больше «10 000».
      sorter: (a, b) => Number(a.balance) - Number(b.balance),
      // Отчёт открывается с крупнейших должников: за этим в него и заходят.
      defaultSortOrder: "descend",
      sortDirections: ["descend", "ascend"],
      render: (v: string) => (
        <span style={{ color: Number(v) > 0 ? "#cf1322" : undefined }}>
          <Money value={v} />
        </span>
      ),
    },
  ];

  return (
    <div>
      <Space
        style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}
        wrap
      >
        <h2 style={{ margin: 0 }}>Дебиторская задолженность</h2>
        <Space wrap>
          <Input
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по клиенту"
            prefix={<SearchOutlined />}
            style={{ width: 260 }}
          />
          <DatePicker
            placeholder="На дату"
            allowClear
            value={asOf}
            onChange={(v) => setAsOf(v)}
            format="DD.MM.YYYY"
          />
        </Space>
      </Space>
      <Table
        rowKey="customer_id"
        size="small"
        loading={query.isPending}
        dataSource={rows}
        columns={columns}
        pagination={{ pageSize: 20, showTotal: (t) => `Всего: ${t}` }}
        locale={{ emptyText: search ? "Клиент не найден" : "Задолженностей нет" }}
        // Итог по НАЙДЕННЫМ строкам, а не по всему отчёту: иначе, отфильтровав
        // одну сеть кофеен, вместо её долга видишь общий и легко ошибаешься.
        summary={() =>
          rows.length > 0 ? (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}>
                <strong>{search ? "Итого по найденным" : "Итого"}</strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right">
                <strong style={{ color: total > 0 ? "#cf1322" : undefined }}>
                  <Money value={total} />
                </strong>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          ) : null
        }
      />
    </div>
  );
}
