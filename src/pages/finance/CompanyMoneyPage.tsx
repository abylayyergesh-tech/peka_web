/** /reports/company-entities — кредиторка и дебиторка по каждому нашему юр. лицу.
 *
 *  Экран отвечает на вопрос «сколько за кем»: у бизнеса два ИП, у каждого свой
 *  БИН, свой счёт и свои долги, и складывать их в один котёл нельзя — за долги
 *  отвечает конкретное юрлицо. Отсюда проваливаются в детали: карточка ведёт в
 *  кредиторку и дебиторку, отфильтрованные по этому юрлицу.
 *
 *  Строка «Без юр. лица» — не декорация, а состояние данных: записи, заведённые
 *  до разделения, и клиенты, которых ни к кому не отнесли. Её видно намеренно.
 *  Без неё сумма по юрлицам была бы меньше общего долга, и расхождение оказалось
 *  бы необъяснимым. По ней тоже можно провалиться и разобрать руками.
 *
 *  Итоговая строка сходится с обычными «Кредиторка» и «Дебиторка»: и там, и здесь
 *  суммы считаются из одних журналов. */
import { ArrowRightOutlined } from "@ant-design/icons";
import {
  Alert,
  Card,
  Col,
  DatePicker,
  Result,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  reportCompanyEntities,
  type CompanyEntityMoney,
} from "@/api/companies";
import { useCan } from "@/auth/store";
import { Money } from "@/components/format";
import { NO_ENTITY_FILTER } from "@/pages/finance/companyEntities";

/** Значение фильтра для ссылок «провалиться»: id юрлица либо `none`. */
function filterValue(row: CompanyEntityMoney): string {
  return row.company_entity_id == null
    ? NO_ENTITY_FILTER
    : String(row.company_entity_id);
}

export default function CompanyMoneyPage() {
  const canRead = useCan("report.read");
  const [asOf, setAsOf] = useState<Dayjs | null>(null);
  const asOfStr = asOf?.format("YYYY-MM-DD");

  const query = useQuery({
    queryKey: ["company-money", { asOf: asOfStr }],
    queryFn: () => reportCompanyEntities({ as_of: asOfStr }),
    enabled: canRead,
  });

  if (!canRead) {
    return (
      <Result
        status="403"
        title="Недостаточно прав"
        subTitle="Нужно право report.read"
      />
    );
  }
  if (query.isError) {
    return (
      <Result
        status="error"
        title="Не удалось загрузить отчёт"
        subTitle={errorMessage(query.error)}
      />
    );
  }

  const rows = query.data?.rows ?? [];

  const columns: ColumnsType<CompanyEntityMoney> = [
    {
      title: "Юр. лицо",
      dataIndex: "name",
      render: (v: string, row) => (
        <Space direction="vertical" size={0}>
          <Space size={6}>
            <span style={{ fontWeight: 500 }}>{v}</span>
            {row.is_default && (
              <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                по умолчанию
              </Tag>
            )}
            {!row.is_active && <Tag style={{ marginInlineEnd: 0 }}>закрыта</Tag>}
            {row.company_entity_id == null && (
              <Tooltip title="Записи, заведённые до разделения на юр. лица, и клиенты без привязки. Их видно, чтобы можно было разобрать.">
                <Tag color="orange" style={{ marginInlineEnd: 0 }}>
                  разобрать
                </Tag>
              </Tooltip>
            )}
          </Space>
          {row.tax_id && (
            <span style={{ color: "#8c8c8c", fontSize: 12 }}>
              БИН {row.tax_id}
              {row.bank_account ? ` · ${row.bank_account}` : ""}
            </span>
          )}
        </Space>
      ),
    },
    {
      title: "Должны мы",
      dataIndex: "payables_balance",
      width: 210,
      align: "right",
      sorter: (a, b) => Number(a.payables_balance) - Number(b.payables_balance),
      render: (v: string, row) => (
        <Space direction="vertical" size={0} style={{ alignItems: "flex-end" }}>
          <strong style={{ color: Number(v) > 0 ? "#cf1322" : undefined }}>
            <Money value={v} />
          </strong>
          <Link
            to={`/reports/payables?company_entity=${filterValue(row)}`}
            style={{ fontSize: 12 }}
          >
            поставщиков: {row.suppliers_with_debt} <ArrowRightOutlined />
          </Link>
        </Space>
      ),
    },
    {
      title: "Должны нам",
      dataIndex: "receivables_balance",
      width: 210,
      align: "right",
      sorter: (a, b) =>
        Number(a.receivables_balance) - Number(b.receivables_balance),
      render: (v: string, row) => (
        <Space direction="vertical" size={0} style={{ alignItems: "flex-end" }}>
          <strong style={{ color: Number(v) > 0 ? "#389e0d" : undefined }}>
            <Money value={v} />
          </strong>
          <Link
            to={`/reports/receivables?company_entity=${filterValue(row)}`}
            style={{ fontSize: 12 }}
          >
            клиентов: {row.customers_with_debt} <ArrowRightOutlined />
          </Link>
        </Space>
      ),
    },
    {
      title: "Итог",
      dataIndex: "net_balance",
      width: 160,
      align: "right",
      sorter: (a, b) => Number(a.net_balance) - Number(b.net_balance),
      render: (v: string) => (
        <Tooltip title="Должны нам минус должны мы">
          <strong style={{ color: Number(v) < 0 ? "#cf1322" : "#389e0d" }}>
            <Money value={v} />
          </strong>
        </Tooltip>
      ),
    },
    {
      title: "Оборот по кредиторке",
      key: "payables_turnover",
      width: 230,
      align: "right",
      render: (_, row) => (
        <span style={{ color: "#8c8c8c", fontSize: 12 }}>
          получено <Money value={row.payables_received} /> · оплачено{" "}
          <Money value={row.payables_paid} />
        </span>
      ),
    },
    {
      title: "Оборот по дебиторке",
      key: "receivables_turnover",
      width: 230,
      align: "right",
      render: (_, row) => (
        <span style={{ color: "#8c8c8c", fontSize: 12 }}>
          начислено <Money value={row.receivables_charged} /> · оплачено{" "}
          <Money value={row.receivables_paid} />
        </span>
      ),
    },
    {
      title: "Клиентов",
      dataIndex: "customers_total",
      width: 120,
      align: "right",
      render: (v: number, row) =>
        v > 0 ? (
          <Link to={`/customers?company_entity=${filterValue(row)}`}>{v}</Link>
        ) : (
          <span style={{ color: "#bfbfbf" }}>0</span>
        ),
    },
  ];

  return (
    <div>
      <Space
        style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}
        wrap
      >
        <h2 style={{ margin: 0 }}>Деньги по юр. лицам</h2>
        <Space wrap>
          <Link to="/company-entities">Реквизиты компаний</Link>
          <DatePicker
            placeholder="На дату"
            allowClear
            value={asOf}
            onChange={(v) => setAsOf(v)}
            format="DD.MM.YYYY"
          />
        </Space>
      </Space>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <Card size="small">
            <Statistic
              title="Должны мы (кредиторка)"
              valueRender={() => (
                <Money value={query.data?.total_payables ?? "0"} />
              )}
              value={0}
              valueStyle={{ color: "#cf1322" }}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small">
            <Statistic
              title="Должны нам (дебиторка)"
              valueRender={() => (
                <Money value={query.data?.total_receivables ?? "0"} />
              )}
              value={0}
              valueStyle={{ color: "#389e0d" }}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small">
            <Statistic
              title="Юр. лиц в отчёте"
              value={rows.filter((r) => r.company_entity_id != null).length}
            />
          </Card>
        </Col>
      </Row>

      {rows.some((r) => r.company_entity_id == null) && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Есть записи без юр. лица"
          description={
            <span>
              Это долги, заведённые до разделения, и клиенты, которых ни к кому не
              отнесли. Чтобы разобрать: откройте{" "}
              <Link to={`/reports/payables?company_entity=${NO_ENTITY_FILTER}`}>
                кредиторку
              </Link>{" "}
              и{" "}
              <Link to={`/reports/receivables?company_entity=${NO_ENTITY_FILTER}`}>
                дебиторку
              </Link>{" "}
              без юр. лица, а клиентов отнесите к юрлицу на странице{" "}
              <Link to="/customers">Клиенты</Link>.
            </span>
          }
        />
      )}

      <Table<CompanyEntityMoney>
        rowKey={(row) => String(row.company_entity_id ?? "none")}
        size="small"
        loading={query.isPending}
        dataSource={rows}
        columns={columns}
        pagination={false}
        scroll={{ x: 1400 }}
        locale={{ emptyText: "Юр. лица не заведены" }}
      />

      <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginTop: 12 }}>
        Суммы считаются из журналов кредиторки и дебиторки — тех же, что и в
        отчётах «Кредиторка» и «Дебиторка», поэтому итог здесь совпадает с ними.
      </Typography.Paragraph>
    </div>
  );
}
