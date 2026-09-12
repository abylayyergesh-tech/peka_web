/** /reports/trial-balance — расширенная оборотно-сальдовая ведомость.

 *  По каждому товару: сколько было на начало, что пришло и ушло по типу
 *  документа, сколько осталось. Колонок, которых в учёте нет (НДС, возврат
 *  поставщику), нет и здесь. */
import { SearchOutlined } from "@ant-design/icons";
import { Alert, Checkbox, Input, Select, Space, Switch, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { listProductCategories } from "@/api/catalog";
import { errorMessage } from "@/api/client";
import { getTrialBalance, type TrialBalanceRow } from "@/api/reports";
import { fmtMoney, fmtQty } from "@/components/format";
import { ReportRangePicker, useReportRange } from "@/pages/finance/reportRange";
import { useWarehousesLookup } from "@/pages/inventory/shared";

type ViewMode = "extended" | "simple";
type GroupBy = "none" | "category" | "group_name";

interface GridRow extends TrialBalanceRow {
  key: string;
  isGroup?: boolean;
  children?: GridRow[];
  in_qty?: string;
  in_cost?: string;
  out_qty?: string;
  out_cost?: string;
}

const NUM_KEYS: (keyof TrialBalanceRow)[] = [
  "opening_qty",
  "opening_cost",
  "receipt_qty",
  "receipt_cost",
  "sale_qty",
  "sale_cost",
  "transfer_qty",
  "transfer_cost",
  "write_off_qty",
  "write_off_cost",
  "inventory_qty",
  "inventory_cost",
  "production_qty",
  "production_cost",
  "closing_qty",
  "closing_cost",
];

const TURNOVER: [keyof TrialBalanceRow, keyof TrialBalanceRow][] = [
  ["receipt_qty", "receipt_cost"],
  ["sale_qty", "sale_cost"],
  ["transfer_qty", "transfer_cost"],
  ["write_off_qty", "write_off_cost"],
  ["inventory_qty", "inventory_cost"],
  ["production_qty", "production_cost"],
];

function isZero(value: string | undefined): boolean {
  return !Number(value ?? 0);
}

function rowIsEmpty(row: TrialBalanceRow): boolean {
  return NUM_KEYS.every((k) => isZero(row[k] as string));
}

function signedQty(value: string | undefined) {
  if (isZero(value)) return "";
  const n = Number(value);
  return (
    <span style={{ color: n < 0 ? "#cf1322" : undefined, whiteSpace: "nowrap" }}>
      {fmtQty(value)}
    </span>
  );
}

function signedMoney(value: string | undefined) {
  if (isZero(value)) return "";
  const n = Number(value);
  return (
    <span style={{ color: n < 0 ? "#cf1322" : undefined, whiteSpace: "nowrap" }}>
      {fmtMoney(value)}
    </span>
  );
}

function addTurnover(row: TrialBalanceRow): Pick<GridRow, "in_qty" | "in_cost" | "out_qty" | "out_cost"> {
  let inQty = 0;
  let inCost = 0;
  let outQty = 0;
  let outCost = 0;
  for (const [qtyKey, costKey] of TURNOVER) {
    const qty = Number(row[qtyKey]);
    const cost = Number(row[costKey]);
    if (qty > 0) {
      inQty += qty;
      inCost += cost;
    } else if (qty < 0) {
      outQty += -qty;
      outCost += -cost;
    } else if (cost > 0) {
      inCost += cost;
    } else if (cost < 0) {
      outCost += -cost;
    }
  }
  return {
    in_qty: String(inQty),
    in_cost: String(inCost),
    out_qty: String(outQty),
    out_cost: String(outCost),
  };
}

function sumField(rows: TrialBalanceRow[], key: keyof TrialBalanceRow): string {
  return String(rows.reduce((acc, r) => acc + Number(r[key] ?? 0), 0));
}

function sumNum(rows: GridRow[], key: keyof GridRow): string {
  return String(rows.reduce((acc, r) => acc + Number(r[key] ?? 0), 0));
}

function qtyCol(
  title: string,
  key: keyof GridRow,
  width = 110,
): ColumnsType<GridRow>[number] {
  return {
    title,
    dataIndex: key,
    align: "right",
    width,
    render: (v: string) => signedQty(v),
    sorter: (a, b) => Number(a[key] ?? 0) - Number(b[key] ?? 0),
  };
}

const PAGE_SIZE = 50;
const TOP_SCROLL_H = 18;
/** Шапка приложения 64 + отступы Content 24×2. */
const PAGE_CHROME = 112;

function moneyCol(
  title: string,
  key: keyof GridRow,
  width = 130,
): ColumnsType<GridRow>[number] {
  return {
    title,
    dataIndex: key,
    align: "right",
    width,
    render: (v: string) => signedMoney(v),
    sorter: (a, b) => Number(a[key] ?? 0) - Number(b[key] ?? 0),
  };
}

export default function TrialBalancePage() {
  const { range, setRange, params: period } = useReportRange();
  const warehouses = useWarehousesLookup();
  const [warehouseId, setWarehouseId] = useState<number | undefined>();
  const [category, setCategory] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("extended");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [hideZeros, setHideZeros] = useState(true);
  const [showReceipts, setShowReceipts] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [bodyY, setBodyY] = useState(480);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tableBoxRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const topInnerRef = useRef<HTMLDivElement>(null);
  const syncingScroll = useRef(false);

  const categories = useQuery({
    queryKey: ["product-categories"],
    queryFn: listProductCategories,
    staleTime: 60_000,
  });

  const query = useQuery({
    queryKey: ["trial-balance", { ...period, warehouseId, category }],
    queryFn: () =>
      getTrialBalance({
        from: period.from,
        to: period.to,
        warehouse_id: warehouseId,
        category,
      }),
  });

  const filtered = useMemo(() => {
    let rows = (query.data?.items ?? []).map((r) => ({
      ...r,
      key: String(r.product_id),
      ...addTurnover(r),
    }));
    if (hideZeros) rows = rows.filter((r) => !rowIsEmpty(r));
    const needle = search.trim().toLowerCase();
    if (needle) {
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(needle) ||
          (r.sku ?? "").toLowerCase().includes(needle) ||
          (r.category ?? "").toLowerCase().includes(needle),
      );
    }
    return rows;
  }, [query.data, hideZeros, search]);

  const dataSource = useMemo(() => {
    if (groupBy === "none") return filtered;
    const buckets = new Map<string, GridRow[]>();
    for (const row of filtered) {
      const label =
        (groupBy === "category" ? row.category : row.group_name) || "Без группы";
      const list = buckets.get(label) ?? [];
      list.push(row);
      buckets.set(label, list);
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "ru"))
      .map(([label, children]) => {
        const head = children[0];
        const group: GridRow = {
          ...head,
          key: `g:${label}`,
          product_id: 0,
          name: `${label} (${children.length})`,
          sku: null,
          category: groupBy === "category" ? label : head.category,
          group_name: groupBy === "group_name" ? label : head.group_name,
          unit_name: "",
          isGroup: true,
          children,
          opening_qty: sumField(children, "opening_qty"),
          opening_cost: sumField(children, "opening_cost"),
          receipt_qty: sumField(children, "receipt_qty"),
          receipt_cost: sumField(children, "receipt_cost"),
          sale_qty: sumField(children, "sale_qty"),
          sale_cost: sumField(children, "sale_cost"),
          transfer_qty: sumField(children, "transfer_qty"),
          transfer_cost: sumField(children, "transfer_cost"),
          write_off_qty: sumField(children, "write_off_qty"),
          write_off_cost: sumField(children, "write_off_cost"),
          inventory_qty: sumField(children, "inventory_qty"),
          inventory_cost: sumField(children, "inventory_cost"),
          production_qty: sumField(children, "production_qty"),
          production_cost: sumField(children, "production_cost"),
          closing_qty: sumField(children, "closing_qty"),
          closing_cost: sumField(children, "closing_cost"),
          ...addTurnover({
            ...head,
            opening_qty: sumField(children, "opening_qty"),
            opening_cost: sumField(children, "opening_cost"),
            receipt_qty: sumField(children, "receipt_qty"),
            receipt_cost: sumField(children, "receipt_cost"),
            sale_qty: sumField(children, "sale_qty"),
            sale_cost: sumField(children, "sale_cost"),
            transfer_qty: sumField(children, "transfer_qty"),
            transfer_cost: sumField(children, "transfer_cost"),
            write_off_qty: sumField(children, "write_off_qty"),
            write_off_cost: sumField(children, "write_off_cost"),
            inventory_qty: sumField(children, "inventory_qty"),
            inventory_cost: sumField(children, "inventory_cost"),
            production_qty: sumField(children, "production_qty"),
            production_cost: sumField(children, "production_cost"),
            closing_qty: sumField(children, "closing_qty"),
            closing_cost: sumField(children, "closing_cost"),
          }),
        };
        return group;
      });
  }, [filtered, groupBy]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [period.from, period.to, warehouseId, category, search, hideZeros, groupBy, query.dataUpdatedAt]);

  const visibleRows = dataSource.slice(0, visibleCount);
  const hasMore = visibleCount < dataSource.length;

  useEffect(() => {
    const box = tableBoxRef.current;
    if (!box) return;
    const measure = () => {
      const headerH = box.querySelector<HTMLElement>(".ant-table-header")?.clientHeight ?? 78;
      const summaryH = box.querySelector<HTMLElement>(".ant-table-summary")?.clientHeight ?? 0;
      const next = Math.max(200, box.clientHeight - headerH - summaryH);
      setBodyY((prev) => (Math.abs(prev - next) < 2 ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [view, showReceipts, query.isPending]);

  useEffect(() => {
    const root = wrapRef.current;
    const top = topScrollRef.current;
    const inner = topInnerRef.current;
    if (!root || !top || !inner) return;

    const scroller = (): HTMLElement | null =>
      root.querySelector<HTMLElement>(".ant-table-body") ??
      root.querySelector<HTMLElement>(".ant-table-content");
    const headerEl = (): HTMLElement | null =>
      root.querySelector<HTMLElement>(".ant-table-header");

    const applyLeft = (left: number) => {
      const table = scroller();
      const head = headerEl();
      if (table) table.scrollLeft = left;
      if (head) head.scrollLeft = left;
      top.scrollLeft = left;
    };

    const resize = () => {
      const table = scroller();
      if (!table) return;
      inner.style.width = `${Math.max(table.scrollWidth, table.clientWidth)}px`;
    };

    const onTop = () => {
      if (syncingScroll.current) return;
      syncingScroll.current = true;
      applyLeft(top.scrollLeft);
      syncingScroll.current = false;
    };
    const onTable = () => {
      const table = scroller();
      if (!table || syncingScroll.current) return;
      syncingScroll.current = true;
      applyLeft(table.scrollLeft);
      resize();
      syncingScroll.current = false;
    };
    const onWheel = (e: WheelEvent) => {
      const table = scroller();
      if (!table) return;
      const dx = e.shiftKey ? e.deltaY : e.deltaX;
      if (!dx) return;
      if (!e.shiftKey && Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      applyLeft(table.scrollLeft + dx);
    };

    resize();
    const table = scroller();
    top.addEventListener("scroll", onTop, { passive: true });
    table?.addEventListener("scroll", onTable, { passive: true });
    table?.addEventListener("wheel", onWheel, { passive: false });
    const ro = new ResizeObserver(resize);
    if (table) ro.observe(table);
    return () => {
      top.removeEventListener("scroll", onTop);
      table?.removeEventListener("scroll", onTable);
      table?.removeEventListener("wheel", onWheel);
      ro.disconnect();
    };
  }, [visibleRows.length, view, showReceipts, query.isPending, groupBy, bodyY]);

  useEffect(() => {
    const root = wrapRef.current;
    const body = root?.querySelector<HTMLElement>(".ant-table-body");
    if (!body) return;

    const loadMore = () => {
      if (body.scrollHeight - body.scrollTop - body.clientHeight > 400) return;
      setVisibleCount((n) => {
        if (n >= dataSource.length) return n;
        return Math.min(n + PAGE_SIZE, dataSource.length);
      });
    };
    loadMore();
    body.addEventListener("scroll", loadMore, { passive: true });
    return () => body.removeEventListener("scroll", loadMore);
  }, [dataSource.length, visibleRows.length, query.isPending, bodyY]);

  const movementHref = (id: number) => {
    const q = new URLSearchParams({
      product_id: String(id),
      from: period.from,
      to: period.to,
    });
    if (warehouseId) q.set("warehouse_id", String(warehouseId));
    return `/reports/product-movements?${q.toString()}`;
  };

  const identity: ColumnsType<GridRow> = [
    {
      title: "Наименование",
      dataIndex: "name",
      fixed: "left",
      width: 240,
      render: (name: string, row) =>
        row.isGroup ? (
          <b>{name}</b>
        ) : (
          <Link to={movementHref(row.product_id)}>{name}</Link>
        ),
      sorter: (a, b) => a.name.localeCompare(b.name, "ru"),
    },
    { title: "Артикул", dataIndex: "sku", width: 110, render: (v) => v || "" },
    {
      title: "Группа",
      dataIndex: "category",
      width: 140,
      render: (v) => v || "",
    },
    {
      title: "Родит. группа",
      dataIndex: "group_name",
      width: 140,
      render: (v) => v || "",
    },
    { title: "Ед. изм.", dataIndex: "unit_name", width: 80 },
  ];

  const opening = {
    title: "Остатки на начало",
    children: [
      qtyCol("Кол-во", "opening_qty"),
      moneyCol("Сумма с/с", "opening_cost"),
    ],
  };
  const closing = {
    title: "Остатки на конец",
    children: [
      qtyCol("Кол-во", "closing_qty"),
      moneyCol("Сумма с/с", "closing_cost"),
    ],
  };

  const extended: ColumnsType<GridRow> = [
    ...identity,
    opening,
    ...(showReceipts
      ? [
          {
            title: "Приходные накладные",
            children: [
              qtyCol("Кол-во", "receipt_qty"),
              moneyCol("Сумма с/с", "receipt_cost"),
            ],
          },
        ]
      : []),
    {
      title: "Реализация",
      children: [qtyCol("Кол-во", "sale_qty"), moneyCol("Сумма с/с", "sale_cost")],
    },
    {
      title: "Внутр. перемещения",
      children: [
        qtyCol("Кол-во", "transfer_qty"),
        moneyCol("Сумма с/с", "transfer_cost"),
      ],
    },
    {
      title: "Списания",
      children: [
        qtyCol("Кол-во", "write_off_qty"),
        moneyCol("Сумма с/с", "write_off_cost"),
      ],
    },
    {
      title: "Инвентаризация",
      children: [
        qtyCol("Кол-во", "inventory_qty"),
        moneyCol("Сумма с/с", "inventory_cost"),
      ],
    },
    {
      title: "Приготовление",
      children: [
        qtyCol("Кол-во", "production_qty"),
        moneyCol("Сумма с/с", "production_cost"),
      ],
    },
    closing,
  ];

  const simple: ColumnsType<GridRow> = [
    ...identity,
    opening,
    {
      title: "Приход",
      children: [qtyCol("Кол-во", "in_qty"), moneyCol("Сумма с/с", "in_cost")],
    },
    {
      title: "Расход",
      children: [qtyCol("Кол-во", "out_qty"), moneyCol("Сумма с/с", "out_cost")],
    },
    closing,
  ];

  return (
    <div
      className="tb-shell"
      style={{
        display: "flex",
        flexDirection: "column",
        height: `calc(100vh - ${PAGE_CHROME}px)`,
        overflow: "hidden",
      }}
    >
      <h2 style={{ marginTop: 0, flexShrink: 0 }}>Расширенная оборотно-сальдовая ведомость</h2>

      <Space wrap style={{ marginBottom: 12, flexShrink: 0 }}>
        <ReportRangePicker value={range} onChange={setRange} />
        <Select
          value={view}
          style={{ width: 180 }}
          onChange={setView}
          options={[
            { value: "extended", label: "Расширенный вид" },
            { value: "simple", label: "Простой вид" },
          ]}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Все склады"
          style={{ width: 220 }}
          options={warehouses.options}
          value={warehouseId}
          onChange={setWarehouseId}
        />
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Поиск"
          style={{ width: 200 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Все категории"
          style={{ width: 200 }}
          loading={categories.isPending}
          value={category}
          onChange={setCategory}
          options={(categories.data ?? []).map((c) => ({
            value: c.name,
            label: c.name,
          }))}
        />
        <Select
          value={groupBy}
          style={{ width: 200 }}
          onChange={setGroupBy}
          options={[
            { value: "none", label: "Без группировки" },
            { value: "category", label: "Группировать по категории" },
            { value: "group_name", label: "Группировать по группе" },
          ]}
        />
        <Checkbox
          checked={showReceipts}
          onChange={(e) => setShowReceipts(e.target.checked)}
        >
          Показывать приходы
        </Checkbox>
        <Space size={6}>
          <Switch checked={hideZeros} onChange={setHideZeros} />
          <span>Скрыть нулевые</span>
        </Space>
      </Space>

      {query.isError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12, flexShrink: 0 }}
          message={errorMessage(query.error)}
        />
      )}

      <div style={{ color: "#8c8c8c", fontSize: 13, marginBottom: 8, flexShrink: 0 }}>
        Показано {Math.min(visibleCount, dataSource.length)} из {filtered.length}
        {hasMore ? " · прокрутите вниз, чтобы подгрузить ещё" : ""}
      </div>
      <div
        className="tb-page"
        ref={wrapRef}
        style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
      >
        <style>{`
          .tb-top-scroll {
            flex-shrink: 0;
            z-index: 20;
            overflow-x: auto;
            overflow-y: hidden;
            height: ${TOP_SCROLL_H}px;
            background: #f5f5f5;
            border: 1px solid #f0f0f0;
            border-bottom: none;
          }
          .tb-top-scroll::-webkit-scrollbar { height: 14px; }
          .tb-top-scroll::-webkit-scrollbar-track { background: #f0f0f0; }
          .tb-top-scroll::-webkit-scrollbar-thumb {
            background: #bfbfbf;
            border-radius: 7px;
          }
          .tb-top-scroll-inner { height: 1px; }
          .tb-table-box {
            flex: 1;
            min-height: 0;
            overflow: hidden;
          }
          .tb-page .ant-table-header,
          .tb-page .ant-table-body {
            overflow-x: hidden !important;
          }
        `}</style>
        <div className="tb-top-scroll" ref={topScrollRef}>
          <div className="tb-top-scroll-inner" ref={topInnerRef} />
        </div>
        <div className="tb-table-box" ref={tableBoxRef}>
      <Table<GridRow>
        rowKey="key"
        size="small"
        loading={query.isPending}
        dataSource={visibleRows}
        columns={view === "extended" ? extended : simple}
        scroll={{ x: view === "extended" ? 2400 : 1400, y: bodyY }}
        expandable={
          groupBy === "none"
            ? undefined
            : { defaultExpandAllRows: true, childrenColumnName: "children" }
        }
        pagination={false}
        rowClassName={(row) => (row.isGroup ? "row-group" : "")}
        summary={() => {
          if (!filtered.length) return null;
          const cell = (i: number, key: keyof GridRow, money = false) => (
            <Table.Summary.Cell index={i} align="right">
              <b>
                {money ? signedMoney(sumNum(filtered, key)) : signedQty(sumNum(filtered, key))}
              </b>
            </Table.Summary.Cell>
          );
          if (view === "simple") {
            return (
              <Table.Summary fixed="bottom">
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={5}>
                  <b>Итого</b>
                </Table.Summary.Cell>
                {cell(5, "opening_qty")}
                {cell(6, "opening_cost", true)}
                {cell(7, "in_qty")}
                {cell(8, "in_cost", true)}
                {cell(9, "out_qty")}
                {cell(10, "out_cost", true)}
                {cell(11, "closing_qty")}
                {cell(12, "closing_cost", true)}
              </Table.Summary.Row>
              </Table.Summary>
            );
          }
          let i = 5;
          return (
            <Table.Summary fixed="bottom">
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={5}>
                <b>Итого</b>
              </Table.Summary.Cell>
              {cell(i++, "opening_qty")}
              {cell(i++, "opening_cost", true)}
              {showReceipts && cell(i++, "receipt_qty")}
              {showReceipts && cell(i++, "receipt_cost", true)}
              {cell(i++, "sale_qty")}
              {cell(i++, "sale_cost", true)}
              {cell(i++, "transfer_qty")}
              {cell(i++, "transfer_cost", true)}
              {cell(i++, "write_off_qty")}
              {cell(i++, "write_off_cost", true)}
              {cell(i++, "inventory_qty")}
              {cell(i++, "inventory_cost", true)}
              {cell(i++, "production_qty")}
              {cell(i++, "production_cost", true)}
              {cell(i++, "closing_qty")}
              {cell(i++, "closing_cost", true)}
            </Table.Summary.Row>
            </Table.Summary>
          );
        }}
      />
        </div>
      </div>
    </div>
  );
}
