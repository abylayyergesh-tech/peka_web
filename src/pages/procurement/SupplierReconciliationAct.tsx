/** Акт сверки с поставщиком: две колонки, как в 1С.

 *  Слева — наши данные (счёт 60): приход в кредит, оплата в дебет.
 *  Справа — ожидаемые записи поставщика, зеркалом. Своих книг у него нет. */
import { PrinterOutlined } from "@ant-design/icons";
import { Alert, Button, Empty, Select, Space, Spin } from "antd";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  getSupplierReconciliation,
  type ReconciliationLine,
  type ReconciliationOut,
} from "@/api/procurement";
import { fmtDate, fmtMoney } from "@/components/format";
import {
  entityFilterOptions,
  entityName,
  NO_ENTITY_FILTER,
  useCompanyEntities,
} from "@/pages/finance/companyEntities";
import { ReportRangePicker, type Range } from "@/pages/finance/reportRange";

const MONTHS_RU = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

function fmtLongDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return fmtDate(iso);
  return `${d} ${MONTHS_RU[m - 1]} ${y} г.`;
}

function moneyOrBlank(value: string): string {
  return Number(value) ? fmtMoney(value) : "";
}

function documentTitle(line: ReconciliationLine): { title: string; number: string } {
  const num = line.document_number ?? line.source_id;
  const when = fmtDate(line.document_date);
  if (line.source_type === "receipt") {
    return {
      title: "Поступление ТМЗ и услуг",
      number: `№ ${num} от ${when}`,
    };
  }
  if (line.source_type === "payment_void") {
    return {
      title: "Сторно платежа",
      number: `№ ${num} от ${when}`,
    };
  }
  const method = (line.payment_method ?? "").toLowerCase();
  const title = /нал|cash/.test(method)
    ? "Расходный кассовый ордер"
    : /карт/.test(method)
      ? "Оплата картой"
      : "Платежное поручение (исходящее)";
  return { title, number: `№ ${num} от ${when}` };
}

function documentHref(line: ReconciliationLine): string | null {
  return line.source_type === "receipt" ? `/documents/${line.source_id}` : null;
}

function PartyName({
  name,
  taxId,
}: {
  name: string;
  taxId: string | null | undefined;
}) {
  return (
    <span>
      {name}
      {taxId ? (
        <span style={{ fontWeight: 400, color: "#595959" }}>{` · БИН ${taxId}`}</span>
      ) : null}
    </span>
  );
}

function SideCells({
  date,
  document,
  debit,
  credit,
  link,
}: {
  date: string;
  document: ReactNode;
  debit: string;
  credit: string;
  link?: string | null;
}) {
  const body = link ? <Link to={link}>{document}</Link> : document;
  return (
    <>
      <td>{date}</td>
      <td className="act-doc">{body}</td>
      <td className="act-num">{debit}</td>
      <td className="act-num">{credit}</td>
    </>
  );
}

function ActTable({ data }: { data: ReconciliationOut }) {
  const openingDate = fmtDate(data.date_from);
  return (
    <table className="act-table">
      <thead>
        <tr>
          <th colSpan={4}>
            Согласно данным <PartyName name={data.our_name} taxId={data.our_tax_id} />, KZT
          </th>
          <th colSpan={4}>
            Согласно данным{" "}
            <PartyName name={data.supplier_name} taxId={data.supplier_tax_id} />, KZT
          </th>
        </tr>
        <tr>
          <th style={{ width: "8%" }}>Дата</th>
          <th>Документ</th>
          <th style={{ width: "11%" }}>Дебет</th>
          <th style={{ width: "11%" }}>Кредит</th>
          <th style={{ width: "8%" }}>Дата</th>
          <th>Документ</th>
          <th style={{ width: "11%" }}>Дебет</th>
          <th style={{ width: "11%" }}>Кредит</th>
        </tr>
      </thead>
      <tbody>
        <tr className="act-saldo">
          <SideCells
            date={openingDate}
            document={`Сальдо начальное на ${openingDate}`}
            debit={moneyOrBlank(data.opening_debit)}
            credit={moneyOrBlank(data.opening_credit)}
          />
          <SideCells
            date={openingDate}
            document={`Сальдо начальное на ${openingDate}`}
            debit={moneyOrBlank(data.opening_credit)}
            credit={moneyOrBlank(data.opening_debit)}
          />
        </tr>
        {data.lines.map((line, i) => {
          const { title, number } = documentTitle(line);
          const doc = (
            <>
              {title}
              <br />
              {number}
            </>
          );
          const href = documentHref(line);
          const when = fmtDate(line.entry_date);
          return (
            <tr key={`${line.source_type}-${line.source_id}-${i}`}>
              <SideCells
                date={when}
                document={doc}
                debit={moneyOrBlank(line.debit)}
                credit={moneyOrBlank(line.credit)}
                link={href}
              />
              <SideCells
                date={when}
                document={doc}
                debit={moneyOrBlank(line.credit)}
                credit={moneyOrBlank(line.debit)}
                link={href}
              />
            </tr>
          );
        })}
        <tr className="act-total">
          <SideCells
            date=""
            document="Обороты за период"
            debit={fmtMoney(data.turnover_debit)}
            credit={fmtMoney(data.turnover_credit)}
          />
          <SideCells
            date=""
            document="Обороты за период"
            debit={fmtMoney(data.turnover_credit)}
            credit={fmtMoney(data.turnover_debit)}
          />
        </tr>
        <tr className="act-saldo">
          <SideCells
            date={fmtDate(data.date_to)}
            document={`Сальдо конечное на ${fmtDate(data.date_to)}`}
            debit={moneyOrBlank(data.closing_debit)}
            credit={moneyOrBlank(data.closing_credit)}
          />
          <SideCells
            date={fmtDate(data.date_to)}
            document={`Сальдо конечное на ${fmtDate(data.date_to)}`}
            debit={moneyOrBlank(data.closing_credit)}
            credit={moneyOrBlank(data.closing_debit)}
          />
        </tr>
      </tbody>
    </table>
  );
}

function conclusion(data: ReconciliationOut): string {
  const closing = Number(data.closing_balance);
  const asOf = fmtDate(data.date_to);
  if (!closing) {
    return `По данным ${data.our_name} на ${asOf} задолженность отсутствует.`;
  }
  const amount = fmtMoney(Math.abs(closing));
  const favor = closing > 0 ? data.supplier_name : data.our_name;
  return `По данным ${data.our_name} на ${asOf} задолженность в пользу ${favor} составляет ${amount}.`;
}

export default function SupplierReconciliationAct({
  supplierId,
  range,
  onRangeChange,
  entityFilter,
  onEntityFilterChange,
}: {
  supplierId: number;
  range: Range;
  onRangeChange: (r: Range) => void;
  entityFilter?: string;
  onEntityFilterChange?: (value: string | undefined) => void;
}) {
  const period = {
    from: range[0].format("YYYY-MM-DD"),
    to: range[1].format("YYYY-MM-DD"),
  };
  const entities = useCompanyEntities(true);

  const query = useQuery({
    queryKey: ["supplier-reconciliation", supplierId, period, entityFilter ?? null],
    queryFn: () =>
      getSupplierReconciliation(supplierId, {
        ...period,
        company_entity: entityFilter,
      }),
    enabled: Number.isFinite(supplierId),
  });

  const data = query.data;

  return (
    <div>
      <style>{`
        .act-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
          table-layout: fixed;
        }
        .act-table th, .act-table td {
          border: 1px solid #000;
          padding: 4px 6px;
          vertical-align: top;
        }
        .act-table th {
          text-align: center;
          font-weight: 600;
          background: #fafafa;
        }
        .act-table .act-num {
          text-align: right;
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
        }
        .act-table .act-doc { line-height: 1.35; }
        .act-table .act-saldo td, .act-table .act-total td { font-weight: 600; }
        .act-wrap { max-width: 1100px; }
        .act-title { text-align: center; margin: 0 0 8px; font-size: 20px; }
        .act-sub { text-align: center; margin: 0 0 4px; }
        .act-preamble, .act-conclusion { margin: 16px 0; line-height: 1.5; }
        .act-signs {
          display: flex;
          gap: 48px;
          margin-top: 32px;
        }
        .act-signs > div { flex: 1; }
        .act-sign-line {
          margin-top: 36px;
          border-top: 1px solid #000;
          padding-top: 4px;
          font-size: 12px;
          color: #595959;
        }
        @media print {
          .no-print, .ant-layout-sider, .ant-layout-header, .ant-tabs-nav {
            display: none !important;
          }
          .act-table th { background: transparent; }
          a { color: #000; text-decoration: none; }
        }
      `}</style>

      <Space wrap className="no-print" style={{ marginBottom: 16 }}>
        <ReportRangePicker value={range} onChange={onRangeChange} />
        {onEntityFilterChange && (
          <Select
            allowClear
            placeholder="Все юр. лица"
            style={{ width: 240 }}
            value={entityFilter}
            loading={entities.isPending}
            options={entityFilterOptions(entities.data)}
            onChange={(v) => onEntityFilterChange(v)}
          />
        )}
        <Button
          icon={<PrinterOutlined />}
          onClick={() => window.print()}
          disabled={!data}
        >
          Печать
        </Button>
      </Space>

      {entityFilter && (
        <Alert
          className="no-print"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            entityFilter === NO_ENTITY_FILTER
              ? "В акт попали только записи без юр. лица"
              : `Акт за «${entityName(entities.data, Number(entityFilter))}»`
          }
        />
      )}

      {query.isError && (
        <Alert
          className="no-print"
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={errorMessage(query.error)}
        />
      )}

      {query.isPending && <Spin style={{ display: "block", margin: "48px auto" }} />}

      {data && (
        <div className="act-wrap reconciliation-act">
          {data.truncated && (
            <Alert
              className="no-print"
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message={`Показаны первые ${data.limit} проводок. Сузьте период.`}
            />
          )}

          <h2 className="act-title">
            Акт сверки взаимных расчетов от {fmtLongDate(data.compiled_on)}
          </h2>
          <p className="act-sub">
            за период с {fmtDate(data.date_from)} по {fmtDate(data.date_to)}
          </p>
          <p className="act-sub">
            между {data.our_name}
            {data.our_tax_id ? ` (БИН ${data.our_tax_id})` : ""} и{" "}
            {data.supplier_name}
            {data.supplier_tax_id ? ` (БИН ${data.supplier_tax_id})` : ""}
          </p>

          <p className="act-preamble">
            Мы, нижеподписавшиеся, {data.our_name} с одной стороны и{" "}
            {data.supplier_name} с другой стороны составили настоящий акт сверки
            взаимных расчетов по данным учета за период с {fmtDate(data.date_from)}{" "}
            по {fmtDate(data.date_to)}.
          </p>

          <ActTable data={data} />

          <p className="act-conclusion">{conclusion(data)}</p>
          <p className="act-conclusion" style={{ color: "#8c8c8c", fontSize: 13 }}>
            Правая сторона заполнена по нашим данным как ожидаемые записи
            контрагента.
          </p>

          <div className="act-signs">
            <div>
              <div>По данным {data.our_name}</div>
              <div className="act-sign-line">подпись, Ф.И.О.</div>
            </div>
            <div>
              <div>По данным {data.supplier_name}</div>
              <div className="act-sign-line">подпись, Ф.И.О.</div>
            </div>
          </div>
        </div>
      )}

      {!query.isPending && !query.isError && !data && (
        <Empty description="Нет данных для акта" />
      )}
    </div>
  );
}
