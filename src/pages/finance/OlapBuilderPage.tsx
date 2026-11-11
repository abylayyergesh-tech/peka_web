/** «Конструктор отчётов» — свой OLAP-отчёт: источник, группировки, показатели,
 * фильтры, сортировка. Запрос собирает сервер из белого списка полей (сырой
 * SQL не принимается); готовый SQL показывается только для чтения. Отчёты
 * можно сохранить в этом браузере и выгрузить в Excel. */
import { DeleteOutlined, PlayCircleOutlined, PlusOutlined, SaveOutlined } from "@ant-design/icons";
import {
  Alert, App, Button, Card, Col, Collapse, Empty, Input, InputNumber, Modal, Row, Segmented,
  Select, Space, Table, Tag, Tooltip, Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  getOlapMeta, getOlapValues, runOlapQuery,
  type OlapColumn, type OlapCubeKey, type OlapFilter, type OlapQuery, type OlapResult,
} from "@/api/olap";
import { ExcelExportButton } from "@/components/excel";
import { fmtDate, fmtMoney, fmtQty } from "@/components/format";
import { ReportRangePicker, useReportRange } from "@/pages/finance/reportRange";

const WEEKDAYS = ["", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
const ENUM_LABELS: Record<string, Record<string, string>> = {
  payment_method: { cash: "Наличные", card: "Карта", credit: "В долг", staff: "Питание" },
  doc_type: {
    receipt: "Приход", sale: "Продажа", sale_storno: "Сторно продажи", write_off: "Списание",
    transfer: "Перемещение", production: "Выпуск", inventory_count: "Инвентаризация",
  },
};
const OP_OPTIONS = [
  { value: "in", label: "в списке" },
  { value: "not_in", label: "не в списке" },
  { value: "contains", label: "содержит текст" },
];
const STORAGE_KEY = "peka-web:olap-builder:saved:v1";

interface Draft {
  cube: OlapCubeKey;
  dimensions: string[];
  measures: string[];
  filters: (OlapFilter & { labels?: Record<string, string> })[];
  sortField?: string;
  sortDir: "asc" | "desc";
  limit: number;
}

const PRESETS: { name: string; draft: Draft }[] = [
  { name: "Выручка по клиентам", draft: { cube: "sales", dimensions: ["customer"],
    measures: ["revenue", "cost", "profit", "margin_pct", "check_count"], filters: [],
    sortField: "revenue", sortDir: "desc", limit: 1000 } },
  { name: "Продажи по часам", draft: { cube: "sales", dimensions: ["hour"],
    measures: ["check_count", "revenue", "avg_check"], filters: [], sortDir: "asc", limit: 1000 } },
  { name: "Фудкост по категориям", draft: { cube: "sales", dimensions: ["category"],
    measures: ["revenue", "cost", "food_cost_pct"], filters: [], sortField: "food_cost_pct",
    sortDir: "desc", limit: 1000 } },
  { name: "Продажи по дням недели", draft: { cube: "sales", dimensions: ["weekday"],
    measures: ["revenue", "check_count", "avg_check"], filters: [], sortDir: "asc", limit: 1000 } },
  { name: "Закупки: поставщик × юр. лицо", draft: { cube: "stock",
    dimensions: ["supplier", "company_entity"], measures: ["cost_in", "documents"],
    filters: [{ field: "doc_type", op: "in", values: ["receipt"], labels: { receipt: "Приход" } }],
    sortField: "cost_in", sortDir: "desc", limit: 1000 } },
  { name: "Списания по категориям", draft: { cube: "stock",
    dimensions: ["write_off_category", "product"], measures: ["qty_out", "cost_out"],
    filters: [{ field: "doc_type", op: "in", values: ["write_off"], labels: { write_off: "Списание" } }],
    sortField: "cost_out", sortDir: "desc", limit: 1000 } },
];

function loadSaved(): Record<string, Draft> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, Draft>;
  } catch {
    return {};
  }
}

function storeSaved(all: Record<string, Draft>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* приватный режим — сохранить негде */
  }
}

/** Значение ячейки для показа. */
function display(col: OlapColumn, v: unknown): string {
  if (v == null || v === "") return "—";
  if (col.kind === "dimension") {
    if (col.key === "weekday") return WEEKDAYS[Number(v)] ?? String(v);
    if (col.key === "hour") return `${String(v).padStart(2, "0")}:00`;
    if (col.type === "bool") return v ? "Да" : "Нет";
    if (col.type === "date") return fmtDate(String(v));
    return ENUM_LABELS[col.key]?.[String(v)] ?? String(v);
  }
  if (col.type === "money") return fmtMoney(String(v));
  if (col.type === "pct") return `${Number(v).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} %`;
  if (col.type === "int") return Number(v).toLocaleString("ru-RU");
  return fmtQty(String(v));
}

function FilterValues({
  cube, field, op, value, labels, range, onChange,
}: {
  cube: OlapCubeKey;
  field: string;
  op: OlapFilter["op"];
  value: (string | number | boolean)[];
  labels?: Record<string, string>;
  range: { from: string; to: string };
  onChange: (values: (string | number | boolean)[], labels: Record<string, string>) => void;
}) {
  const [search, setSearch] = useState("");
  const options = useQuery({
    queryKey: ["olap-values", cube, field, range, search],
    queryFn: () => getOlapValues({ cube, dimension: field, ...range, q: search || undefined }),
    enabled: !!field && op !== "contains",
    staleTime: 60_000,
  });
  if (op === "contains") {
    return (
      <Select
        mode="tags"
        style={{ minWidth: 260 }}
        placeholder="Текст (можно несколько)"
        value={value.map(String)}
        onChange={(v: string[]) => onChange(v, {})}
        open={false}
      />
    );
  }
  const opts = (options.data ?? []).map((o) => ({
    value: String(o.value),
    label: field === "weekday" ? WEEKDAYS[Number(o.value)] ?? o.label
      : ENUM_LABELS[field]?.[String(o.value)] ?? o.label,
  }));
  // Уже выбранные значения показываем, даже если их нет в текущем поиске.
  for (const v of value) {
    if (!opts.some((o) => o.value === String(v))) {
      opts.push({ value: String(v), label: labels?.[String(v)] ?? String(v) });
    }
  }
  return (
    <Select
      mode="multiple"
      showSearch
      filterOption={false}
      onSearch={setSearch}
      loading={options.isFetching}
      style={{ minWidth: 260 }}
      placeholder="Значения"
      value={value.map(String)}
      options={opts}
      onChange={(vals: string[]) => {
        const map: Record<string, string> = {};
        for (const v of vals) map[v] = opts.find((o) => o.value === v)?.label ?? v;
        onChange(vals.map((v) => (/^-?\d+$/.test(v) ? Number(v) : v)), map);
      }}
    />
  );
}

export default function OlapBuilderPage() {
  const { message } = App.useApp();
  const { range, setRange, params } = useReportRange();
  const meta = useQuery({ queryKey: ["olap-meta"], queryFn: getOlapMeta, staleTime: 300_000 });
  const [draft, setDraft] = useState<Draft>(PRESETS[0].draft);
  const [saved, setSaved] = useState<Record<string, Draft>>(loadSaved);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [result, setResult] = useState<OlapResult | null>(null);

  const cube = meta.data?.find((c) => c.key === draft.cube);
  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  const run = useMutation({
    mutationFn: () => {
      const body: OlapQuery = {
        cube: draft.cube,
        date_from: params.from,
        date_to: params.to,
        dimensions: draft.dimensions,
        measures: draft.measures,
        filters: draft.filters
          .filter((f) => f.field && f.values.length)
          .map(({ field, op, values }) => ({ field, op, values })),
        sort: draft.sortField ? [{ field: draft.sortField, dir: draft.sortDir }] : [],
        limit: draft.limit,
      };
      return runOlapQuery(body);
    },
    onSuccess: setResult,
    onError: (e) => message.error(errorMessage(e)),
  });

  // Первый отчёт строится сразу, как только известны поля.
  useEffect(() => {
    if (meta.data && !result && !run.isPending) run.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.data]);

  const sortOptions = useMemo(() => [
    ...draft.dimensions.map((k) => ({ value: k, label: cube?.dimensions.find((d) => d.key === k)?.label ?? k })),
    ...draft.measures.map((k) => ({ value: k, label: cube?.measures.find((m) => m.key === k)?.label ?? k })),
  ], [draft.dimensions, draft.measures, cube]);

  const columns: ColumnsType<Record<string, unknown>> = (result?.columns ?? []).map((c) => ({
    title: c.label,
    dataIndex: c.key,
    align: c.kind === "measure" ? "right" : "left",
    render: (v: unknown) => display(c, v),
    sorter: (a, b) => {
      const x = a[c.key];
      const y = b[c.key];
      const nx = Number(x);
      const ny = Number(y);
      if (!Number.isNaN(nx) && !Number.isNaN(ny)) return nx - ny;
      return String(x ?? "").localeCompare(String(y ?? ""), "ru");
    },
  }));

  function applyDraft(d: Draft) {
    setDraft(d);
    setResult(null);
    setTimeout(() => run.mutate(), 0);
  }

  return (
    <div>
      <Space style={{ width: "100%", justifyContent: "space-between", marginBottom: 12 }} wrap>
        <h2 style={{ margin: 0 }}>Конструктор отчётов (OLAP)</h2>
        <Space wrap>
          <Select
            style={{ width: 240 }}
            placeholder="Готовые и сохранённые отчёты"
            value={null}
            onChange={(name: string) => {
              const preset = PRESETS.find((p) => `preset:${p.name}` === name);
              const own = saved[name.replace(/^saved:/, "")];
              if (preset) applyDraft(preset.draft);
              else if (own) applyDraft(own);
            }}
            options={[
              { label: "Готовые", options: PRESETS.map((p) => ({ value: `preset:${p.name}`, label: p.name })) },
              ...(Object.keys(saved).length
                ? [{ label: "Мои (в этом браузере)", options: Object.keys(saved).map((n) => ({ value: `saved:${n}`, label: n })) }]
                : []),
            ]}
          />
          <Button icon={<SaveOutlined />} onClick={() => { setSaveName(""); setSaveOpen(true); }}>
            Сохранить
          </Button>
        </Space>
      </Space>
      {meta.isError && <Alert type="error" showIcon message={errorMessage(meta.error)} />}

      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={[16, 12]}>
          <Col xs={24} lg={12}>
            <Space wrap>
              <Segmented
                value={draft.cube}
                onChange={(v) => patch({
                  cube: v as OlapCubeKey, dimensions: [], filters: [], sortField: undefined,
                  measures: v === "sales" ? ["revenue", "quantity"] : ["qty_in", "qty_out", "cost_net"],
                })}
                options={(meta.data ?? []).map((c) => ({ value: c.key, label: c.label }))}
              />
              <ReportRangePicker value={range} onChange={setRange} />
            </Space>
            {cube && (
              <Typography.Paragraph type="secondary" style={{ margin: "6px 0 0", fontSize: 12 }}>
                {cube.description}
              </Typography.Paragraph>
            )}
          </Col>
          <Col xs={24} lg={12}>
            <Space wrap>
              <span>Сортировка</span>
              <Select allowClear style={{ width: 200 }} placeholder="По умолчанию"
                value={draft.sortField} options={sortOptions}
                onChange={(v) => patch({ sortField: v })} />
              <Segmented value={draft.sortDir} onChange={(v) => patch({ sortDir: v as "asc" | "desc" })}
                options={[{ value: "desc", label: "↓" }, { value: "asc", label: "↑" }]} />
              <Tooltip title="Сколько строк показать (до 10 000)">
                <InputNumber min={1} max={10000} value={draft.limit} addonBefore="Строк"
                  onChange={(v) => patch({ limit: Number(v) || 1000 })} style={{ width: 150 }} />
              </Tooltip>
            </Space>
          </Col>
          <Col xs={24} lg={12}>
            <div style={{ marginBottom: 4 }}>Группировать по (в порядке выбора)</div>
            <Select
              mode="multiple"
              style={{ width: "100%" }}
              placeholder="Без группировки — одна строка итогов"
              value={draft.dimensions}
              onChange={(v: string[]) => patch({ dimensions: v.slice(0, 6) })}
              options={(cube?.dimensions ?? []).map((d) => ({ value: d.key, label: d.label, title: d.hint ?? undefined }))}
            />
          </Col>
          <Col xs={24} lg={12}>
            <div style={{ marginBottom: 4 }}>Показатели</div>
            <Select
              mode="multiple"
              style={{ width: "100%" }}
              value={draft.measures}
              onChange={(v: string[]) => patch({ measures: v })}
              options={(cube?.measures ?? []).map((m) => ({ value: m.key, label: m.label, title: m.hint ?? undefined }))}
            />
          </Col>
          <Col span={24}>
            <div style={{ marginBottom: 4 }}>Фильтры</div>
            <Space direction="vertical" style={{ width: "100%" }}>
              {draft.filters.map((f, i) => (
                <Space key={i} wrap>
                  <Select style={{ width: 200 }} placeholder="Поле" value={f.field || undefined}
                    options={(cube?.dimensions ?? []).filter((d) => d.filterable).map((d) => ({ value: d.key, label: d.label }))}
                    onChange={(v: string) => patch({ filters: draft.filters.map((x, j) => (j === i ? { field: v, op: "in", values: [] } : x)) })} />
                  <Select style={{ width: 160 }} value={f.op} options={OP_OPTIONS}
                    onChange={(v) => patch({ filters: draft.filters.map((x, j) => (j === i ? { ...x, op: v, values: [] } : x)) })} />
                  {f.field && (
                    <FilterValues cube={draft.cube} field={f.field} op={f.op} value={f.values}
                      labels={f.labels} range={params}
                      onChange={(values, labels) => patch({ filters: draft.filters.map((x, j) => (j === i ? { ...x, values, labels } : x)) })} />
                  )}
                  <Button type="text" danger icon={<DeleteOutlined />}
                    onClick={() => patch({ filters: draft.filters.filter((_x, j) => j !== i) })} />
                </Space>
              ))}
              <Button size="small" icon={<PlusOutlined />}
                onClick={() => patch({ filters: [...draft.filters, { field: "", op: "in", values: [] }] })}>
                Добавить фильтр
              </Button>
            </Space>
          </Col>
          <Col span={24}>
            <Space>
              <Button type="primary" icon={<PlayCircleOutlined />} loading={run.isPending}
                disabled={!draft.measures.length} onClick={() => run.mutate()}>
                Построить
              </Button>
              <ExcelExportButton
                fileName="Конструктор отчётов"
                disabled={!result}
                sheets={() => result ? [{
                  name: cube?.label ?? "Отчёт",
                  caption: [`${cube?.label ?? "Отчёт"} за ${fmtDate(params.from)} — ${fmtDate(params.to)}`],
                  columns: result.columns.map((c) => ({
                    title: c.label,
                    type: c.kind === "measure" ? (c.type === "pct" ? "pct" as const : "number" as const) : "text" as const,
                    value: (r: Record<string, unknown>) => (c.kind === "measure" ? r[c.key] : display(c, r[c.key])),
                  })),
                  rows: result.rows,
                  totals: Object.fromEntries(result.columns.filter((c) => c.kind === "measure")
                    .map((c) => [c.label, result.totals[c.key]])),
                }] : []}
              />
            </Space>
          </Col>
        </Row>
      </Card>

      {result?.truncated && (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }}
          message={`Показаны первые ${result.row_count} строк — увеличьте лимит или добавьте фильтр`} />
      )}
      <Table
        size="small"
        rowKey={(_r, i) => String(i)}
        loading={run.isPending}
        dataSource={result?.rows ?? []}
        columns={columns}
        scroll={{ x: true }}
        pagination={{ pageSize: 100, showSizeChanger: true, pageSizeOptions: [50, 100, 500] }}
        locale={{ emptyText: <Empty description="Нет данных за период" /> }}
        summary={() => result && result.columns.some((c) => c.kind === "measure") ? (
          <Table.Summary fixed>
            <Table.Summary.Row>
              {result.columns.map((c, i) => (
                <Table.Summary.Cell key={c.key} index={i} align={c.kind === "measure" ? "right" : "left"}>
                  <b>{c.kind === "measure" ? display(c, result.totals[c.key]) : i === 0 ? "Итого" : ""}</b>
                </Table.Summary.Cell>
              ))}
            </Table.Summary.Row>
          </Table.Summary>
        ) : null}
      />
      {result?.sql && (
        <Collapse style={{ marginTop: 12 }} items={[{
          key: "sql",
          label: <span>SQL-запрос <Tag>только чтение</Tag></span>,
          children: (
            <Typography.Paragraph copyable={{ text: result.sql }} style={{ marginBottom: 0 }}>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, margin: 0 }}>{result.sql}</pre>
            </Typography.Paragraph>
          ),
        }]} />
      )}

      <Modal open={saveOpen} title="Сохранить отчёт" okText="Сохранить" cancelText="Отмена"
        onCancel={() => setSaveOpen(false)}
        onOk={() => {
          const name = saveName.trim();
          if (!name) return;
          const next = { ...saved, [name]: draft };
          setSaved(next);
          storeSaved(next);
          setSaveOpen(false);
          message.success("Отчёт сохранён в этом браузере");
        }}>
        <Input placeholder="Название, например «Выручка по точкам»" value={saveName}
          onChange={(e) => setSaveName(e.target.value)} maxLength={80} />
        {Object.keys(saved).length > 0 && (
          <div style={{ marginTop: 12 }}>
            <Typography.Text type="secondary">Сохранённые:</Typography.Text>
            <div>
              {Object.keys(saved).map((n) => (
                <Tag key={n} closable onClose={() => {
                  const next = { ...saved };
                  delete next[n];
                  setSaved(next);
                  storeSaved(next);
                }}>{n}</Tag>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
