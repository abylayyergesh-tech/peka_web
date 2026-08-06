/** /inventory-count/:id/report — отчёт по инвентаризационной сессии.
 *
 *  Отчёт отвечает не на вопрос «сколько недостача», а на вопрос «почему». Поэтому
 *  четыре блока, и каждый закрывает свою причину:
 *
 *  1. Нестыковки с ДВИЖЕНИЯМИ за период рядом. Расхождение объясняется либо
 *     движением, которое не заметили (приход не завели, продажу пробили не с того
 *     склада), либо тем, что движений не было вовсе — и тогда дело не в учёте, а
 *     на полке. Второй случай важнее первого, поэтому он вынесен в отдельный
 *     счётчик «без движений».
 *  2. Перемещения между складами за период — самая частая причина «нестыковки,
 *     которой нет»: товар перевезли, документ завели позже или не завели. Если
 *     оба склада в охвате сессии, перемещение объясняет СРАЗУ ПАРУ расхождений:
 *     недостачу на одном и излишек на другом.
 *  3. Пустые полки — позиции, посчитанные в ноль. Это полная недостача, а не
 *     пропуск, и в отчёте она видна отдельно.
 *  4. Непосчитанное — позиции с остатком, до которых не дошли. Без этого блока
 *     «нестыковок нет» может означать «просто не считали».
 *
 *  У ЗАКРЫТОЙ сессии расхождения берутся из проводок, а не пересчитываются по
 *  листу: после закрытия остатки уже равны факту, и «факт минус остаток» дал бы
 *  нули. Столбец «учёт был» тоже поэтому берётся из журнала. */
import { Alert, Card, Col, Descriptions, Row, Segmented, Space, Statistic, Table, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  getCountReport,
  type CountReportRow,
  type CountReportTransfer,
  type CountReportWarehouse,
} from "@/api/counting";
import { Money, fmtDate, fmtDateTime, fmtQty } from "@/components/format";
import {
  RowStatusTag, SessionStatusTag, movementsHint, signed,
} from "@/pages/inventory/countShared";

type View = "diff" | "empty" | "todo" | "all";

export default function CountReportPage() {
  const { id } = useParams<{ id: string }>();
  const sessionId = Number(id);
  const navigate = useNavigate();
  const [view, setView] = useState<View>("diff");
  const [warehouseId, setWarehouseId] = useState<number | "all">("all");

  const query = useQuery({
    queryKey: ["count-report", sessionId],
    queryFn: () => getCountReport(sessionId),
    enabled: Number.isFinite(sessionId),
  });

  const report = query.data;
  const rows = useMemo(() => {
    const all = report?.rows ?? [];
    return all.filter((r) => {
      if (warehouseId !== "all" && r.warehouse_id !== warehouseId) return false;
      if (view === "all") return true;
      if (view === "todo") return r.status === "uncounted";
      // «Пустая полка» — посчитали в ноль. Это полная недостача, и её отделяют
      // от прочих недостач: причина у неё другая (полку опустошили целиком).
      if (view === "empty") {
        return r.counted_quantity != null && Number(r.counted_quantity) === 0;
      }
      return r.status === "shortage" || r.status === "surplus";
    });
  }, [report, view, warehouseId]);

  const emptyShelves = useMemo(
    () =>
      (report?.rows ?? []).filter(
        (r) => r.counted_quantity != null && Number(r.counted_quantity) === 0,
      ).length,
    [report],
  );

  if (query.isError) {
    return <Alert type="error" showIcon message={errorMessage(query.error)} />;
  }

  const columns: ColumnsType<CountReportRow> = [
    ...(warehouseId === "all"
      ? [{
          title: "Склад",
          dataIndex: "warehouse_name",
          width: 160,
        } as ColumnsType<CountReportRow>[number]]
      : []),
    {
      title: "Продукт",
      dataIndex: "product_name",
      render: (v: string, row) => (
        <Space direction="vertical" size={0} style={{ display: "flex" }}>
          <span>{v}</span>
          {row.sku && <span style={{ color: "#999", fontSize: 12 }}>{row.sku}</span>}
        </Space>
      ),
    },
    {
      title: "Состояние",
      dataIndex: "status",
      width: 120,
      render: (_, row) => (
        <Space size={4}>
          <RowStatusTag status={row.status} />
          {row.counted_quantity != null && Number(row.counted_quantity) === 0 && (
            <Tooltip title="Полка пуста: посчитали в ноль — полная недостача, а не пропуск">
              <Tag style={{ marginInlineEnd: 0 }}>пусто</Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: "Учёт был",
      dataIndex: "expected_quantity",
      width: 130,
      align: "right",
      render: (v: string, row) => (
        <Space size={4}>
          <span>{fmtQty(v)}</span>
          {row.drifted && (
            <Tooltip
              title={`На момент подсчёта было ${fmtQty(row.expected_at_count)} — остаток изменился уже после того, как посчитали`}
            >
              <Tag color="orange" style={{ marginInlineEnd: 0 }}>
                уехал
              </Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: "По факту",
      dataIndex: "counted_quantity",
      width: 120,
      align: "right",
      render: (v: string | null, row) =>
        v == null ? (
          <span style={{ color: "#bbb" }}>—</span>
        ) : (
          <Space size={4}>
            <span>{fmtQty(v)}</span>
            <span style={{ color: "#999", fontSize: 12 }}>{row.unit_name}</span>
          </Space>
        ),
    },
    {
      title: "Разница",
      dataIndex: "diff",
      width: 150,
      align: "right",
      render: (v: string, row) => {
        if (row.status === "uncounted") return <span style={{ color: "#bbb" }}>—</span>;
        if (row.status === "match") return <Tag color="green">0</Tag>;
        const s = signed(v);
        return (
          <Space direction="vertical" size={0} style={{ alignItems: "flex-end" }}>
            <b style={{ color: s.color }}>{s.text}</b>
            <span style={{ color: "#999", fontSize: 12 }}>
              <Money value={row.diff_value} />
            </span>
          </Space>
        );
      },
    },
    {
      // Ради этого столбца отчёт и нужен: расхождение без движений — это не
      // «забыли документ», а физическая пропажа или ошибка подсчёта.
      title: "Движения за период",
      key: "movements",
      width: 240,
      render: (_, row) => {
        const m = row.movements;
        const hint = movementsHint(m);
        if (!m.any) {
          return (
            <Tooltip title="С начала сессии по этой позиции не было ни одного движения — расхождение не объясняется учётом">
              <Tag color={row.status === "match" ? "default" : "red"}>
                движений не было
              </Tag>
            </Tooltip>
          );
        }
        return (
          <Tooltip title={hint}>
            <Space size={4} wrap>
              {Number(m.receipt) !== 0 && (
                <Tag color="green">приход {signed(m.receipt).text}</Tag>
              )}
              {Number(m.sale) !== 0 && (
                <Tag color="orange">продажи {signed(m.sale).text}</Tag>
              )}
              {Number(m.write_off) !== 0 && (
                <Tag color="red">списание {signed(m.write_off).text}</Tag>
              )}
              {Number(m.production) !== 0 && (
                <Tag color="purple">выпуск {signed(m.production).text}</Tag>
              )}
              {(Number(m.transfer_in) !== 0 || Number(m.transfer_out) !== 0) && (
                <Tag color="blue">
                  перемещение {signed(Number(m.transfer_in) + Number(m.transfer_out)).text}
                </Tag>
              )}
            </Space>
          </Tooltip>
        );
      },
    },
  ];

  const warehouseColumns: ColumnsType<CountReportWarehouse> = [
    { title: "Склад", dataIndex: "warehouse_name" },
    {
      title: "Посчитано",
      key: "counted",
      width: 130,
      align: "right",
      render: (_, w) => `${w.counted} / ${w.lines_total}`,
    },
    { title: "Сходится", dataIndex: "matches", width: 110, align: "right" },
    {
      title: "Недостач",
      dataIndex: "shortages",
      width: 110,
      align: "right",
      render: (v: number) => (v ? <b style={{ color: "#cf1322" }}>{v}</b> : 0),
    },
    {
      title: "Излишков",
      dataIndex: "surpluses",
      width: 110,
      align: "right",
      render: (v: number) => (v ? <b style={{ color: "#d48806" }}>{v}</b> : 0),
    },
    {
      title: "Не посчитано",
      dataIndex: "uncounted",
      width: 130,
      align: "right",
      render: (v: number) => (v ? <b style={{ color: "#d46b08" }}>{v}</b> : 0),
    },
    {
      title: "Недостача, ₸",
      dataIndex: "shortage_value",
      width: 150,
      align: "right",
      render: (v: string) => <Money value={v} />,
    },
    {
      title: "Излишек, ₸",
      dataIndex: "surplus_value",
      width: 150,
      align: "right",
      render: (v: string) => <Money value={v} />,
    },
    {
      title: "Итог, ₸",
      dataIndex: "net_value",
      width: 150,
      align: "right",
      render: (v: string) => <Money value={v} />,
    },
    {
      title: "Документ",
      key: "document",
      width: 130,
      render: (_, w) =>
        w.document_id ? (
          <a onClick={() => navigate(`/documents/${w.document_id}`)}>
            №{w.document_number ?? w.document_id}
          </a>
        ) : (
          <Tooltip title="Проводить было нечего: расхождений по складу нет">
            <span style={{ color: "#bbb" }}>—</span>
          </Tooltip>
        ),
    },
  ];

  const transferColumns: ColumnsType<CountReportTransfer> = [
    {
      title: "Дата",
      dataIndex: "doc_date",
      width: 110,
      render: (v: string) => fmtDate(v),
    },
    {
      title: "Документ",
      key: "doc",
      width: 120,
      render: (_, t) => (
        <a onClick={() => navigate(`/documents/${t.document_id}`)}>
          №{t.number ?? t.document_id}
        </a>
      ),
    },
    { title: "Продукт", dataIndex: "product_name" },
    {
      title: "Количество",
      dataIndex: "quantity",
      width: 130,
      align: "right",
      render: (v: string) => fmtQty(v),
    },
    { title: "Откуда", dataIndex: "from_warehouse_name", width: 170 },
    { title: "Куда", dataIndex: "to_warehouse_name", width: 170 },
    {
      title: "",
      key: "both",
      width: 200,
      render: (_, t) =>
        t.both_in_session ? (
          <Tooltip title="Оба склада в этой сессии: перемещение может объяснять сразу пару расхождений — недостачу на одном и излишек на другом">
            <Tag color="blue">внутри сессии</Tag>
          </Tooltip>
        ) : null,
    },
  ];

  return (
    <div>
      <Space
        style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}
      >
        <Space align="center">
          <h2 style={{ margin: 0 }}>
            Отчёт: {report?.session.name ?? "инвентаризация"}
          </h2>
          {report && <SessionStatusTag status={report.session.status} />}
        </Space>
        <Space>
          <a onClick={() => navigate("/inventory-count")}>К списку</a>
          <a onClick={() => navigate(`/inventory-count/${sessionId}`)}>Лист пересчёта</a>
        </Space>
      </Space>

      {report && (
        <>
          <Descriptions
            size="small"
            bordered
            column={{ xs: 1, sm: 2, md: 4 }}
            style={{ marginBottom: 16 }}
            items={[
              {
                key: "date",
                label: "Дата пересчёта",
                children: fmtDate(report.session.count_date),
              },
              {
                key: "period",
                label: "Период движений",
                children: `${fmtDateTime(report.period_from)} — ${fmtDateTime(report.period_to)}`,
              },
              {
                key: "who",
                label: "Открыл",
                children: report.session.opened_by_name ?? "—",
              },
              {
                key: "closed",
                label: "Закрыл",
                children: report.session.closed_by_name ?? "—",
              },
            ]}
          />

          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic
                  title="Посчитано"
                  value={`${report.totals.counted} / ${report.totals.lines_total}`}
                />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic
                  title="Недостача"
                  formatter={() => <Money value={report.totals.shortage_value} />}
                  value={report.totals.shortage_value}
                  valueStyle={{ color: "#cf1322" }}
                  suffix={
                    <span style={{ fontSize: 13, color: "#999" }}>
                      {report.totals.shortages} поз.
                    </span>
                  }
                />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic
                  title="Излишек"
                  formatter={() => <Money value={report.totals.surplus_value} />}
                  value={report.totals.surplus_value}
                  valueStyle={{ color: "#389e0d" }}
                  suffix={
                    <span style={{ fontSize: 13, color: "#999" }}>
                      {report.totals.surpluses} поз.
                    </span>
                  }
                />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic
                  title="Итог по деньгам"
                  formatter={() => <Money value={report.totals.net_value} />}
                  value={report.totals.net_value}
                />
              </Card>
            </Col>
          </Row>

          {report.totals.without_movements > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message={`Расхождений без движений: ${report.totals.without_movements}`}
              description="По этим позициям с начала сессии не было ни одного движения — значит расхождение не объясняется незаведённым документом. Смотреть надо на полке и на подсчёте."
            />
          )}

          {report.totals.uncounted > 0 && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={`Не посчитано позиций: ${report.totals.uncounted}`}
              description="Их остатки не менялись. Пока они есть, «нестыковок нет» ещё не значит, что всё сошлось."
            />
          )}

          <Card size="small" title="По складам" style={{ marginBottom: 16 }}>
            <Table<CountReportWarehouse>
              rowKey="warehouse_id"
              size="small"
              pagination={false}
              dataSource={report.warehouses}
              columns={warehouseColumns}
              scroll={{ x: 1500 }}
            />
          </Card>

          <Card
            size="small"
            title="Нестыковки"
            style={{ marginBottom: 16 }}
            extra={
              <Space wrap>
                <Segmented<number | "all">
                  value={warehouseId}
                  onChange={setWarehouseId}
                  options={[
                    { value: "all" as const, label: "Все склады" },
                    ...report.warehouses.map((w) => ({
                      value: w.warehouse_id,
                      label: w.warehouse_name,
                    })),
                  ]}
                />
                <Segmented<View>
                  value={view}
                  onChange={setView}
                  options={[
                    {
                      value: "diff",
                      label: `Расхождения (${report.totals.shortages + report.totals.surpluses})`,
                    },
                    { value: "empty", label: `Пустые полки (${emptyShelves})` },
                    { value: "todo", label: `Не посчитано (${report.totals.uncounted})` },
                    { value: "all", label: `Все (${report.totals.lines_total})` },
                  ]}
                />
              </Space>
            }
          >
            <Table<CountReportRow>
              rowKey={(r) => `${r.warehouse_id}-${r.product_id}`}
              size="small"
              loading={query.isFetching}
              dataSource={rows}
              columns={columns}
              pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (t) => `${t} позиций` }}
              scroll={{ x: 1200 }}
              locale={{
                emptyText:
                  view === "diff"
                    ? "Расхождений нет — факт совпал с учётом"
                    : "Ничего не подходит под фильтр",
              }}
            />
          </Card>

          <Card
            size="small"
            title={`Перемещения за период (${report.transfers.length})`}
          >
            {report.transfers.length === 0 ? (
              <Alert
                type="success"
                showIcon
                message="Перемещений между складами за период сессии не было"
                description="Значит расхождения нельзя объяснить перевозкой товара между складами."
              />
            ) : (
              <>
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message="Зачем этот блок"
                  description="Товар перевезли, а документ завели позже или не завели вовсе — и на одном складе он в недостаче, а на другом в излишке. Перемещения с пометкой «внутри сессии» стоит сверить с расхождениями выше в первую очередь."
                />
                <Table<CountReportTransfer>
                  rowKey={(t) => `${t.document_id}-${t.product_id}`}
                  size="small"
                  pagination={{ pageSize: 20, hideOnSinglePage: true }}
                  dataSource={report.transfers}
                  columns={transferColumns}
                  scroll={{ x: 1100 }}
                />
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
