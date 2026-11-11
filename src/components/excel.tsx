/** Выгрузка отчёта в Excel (.xlsx) прямо из браузера.
 *
 * Один механизм на все отчёты кабинета: страница отдаёт колонки своей таблицы
 * (antd `columns`) и строки — получается лист с шапкой, числами-числами
 * (а не текстом «12 345,00 ₸»), автофильтром, закреплённой шапкой и строкой
 * итогов. Библиотека (exceljs) грузится только по нажатию кнопки, чтобы не
 * утяжелять кабинет.
 *
 * Значение ячейки берётся из данных строки (`dataIndex`), а не из того, что
 * нарисовано в таблице: там суммы с пробелами, теги и подсказки. Колонка без
 * `dataIndex` (собрана из нескольких полей) — по её `render`, текстом. Колонку
 * можно уточнить свойствами `excelValue` / `excelTitle` / `excelSkip`. */
import { DownloadOutlined } from "@ant-design/icons";
import { App, Button, Tooltip } from "antd";
import type { ColumnType, ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { isValidElement, useState, type ReactNode } from "react";

import { errorMessage } from "@/api/client";
import { toBusiness } from "@/components/format";

export type CellType = "text" | "number" | "money" | "qty" | "pct" | "date" | "datetime";

export interface ExcelColumn<T> {
  title: string;
  value: (row: T, index: number) => unknown;
  type?: CellType;
  width?: number;
}

export interface ExcelSheet<T = any> {
  name: string;
  columns: ExcelColumn<T>[];
  rows: T[];
  /** Строка итогов: по заголовку колонки или по номеру колонки. */
  totals?: Record<string, unknown>;
  /** Строки над таблицей: название отчёта, период, фильтры. */
  caption?: string[];
}

/** Доп. свойства колонки antd для выгрузки. */
export type ExcelColumnExtra<T> = {
  excelValue?: (row: T, index: number) => unknown;
  excelTitle?: string;
  excelSkip?: boolean;
  excelType?: CellType;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const NUMERIC = /^-?\d+(\.\d+)?$/;
const FORMATTED_NUMBER = /^-?[\d\s  ]+([.,]\d+)?\s*(₸|%)?$/;

/** Текст из React-узла без рендера: строки, дети, у <Money value> — значение. */
export function nodeText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement(node)) {
    const props = node.props as Record<string, unknown>;
    if (props.children != null) return nodeText(props.children as ReactNode);
    for (const key of ["value", "text", "title", "label"]) {
      const v = props[key];
      if (typeof v === "string" || typeof v === "number") return String(v);
    }
  }
  return "";
}

function getPath(row: unknown, path: unknown): unknown {
  const keys = Array.isArray(path) ? path : [path];
  let cur: unknown = row;
  for (const k of keys) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[String(k)];
  }
  return cur;
}

/** Значение для ячейки: числа — числами, даты — датами по Астане. */
export function cellValue(raw: unknown, type?: CellType): unknown {
  if (raw == null || raw === "") return null;
  if (typeof raw === "boolean") return raw ? "Да" : "Нет";
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (type === "text") return s;
    if (NUMERIC.test(s)) return Number(s);
    if (ISO_DATE.test(s)) return dayjs(s).format("DD.MM.YYYY");
    if (ISO_DATETIME.test(s)) return toBusiness(s).format("DD.MM.YYYY HH:mm");
    if (FORMATTED_NUMBER.test(s) && /\d/.test(s)) {
      const n = Number(s.replace(/[\s  ₸%]/g, "").replace(",", "."));
      if (!Number.isNaN(n)) return n;
    }
    return s;
  }
  if (Array.isArray(raw)) return raw.map((x) => cellValue(x, "text")).join(", ");
  return String(raw);
}

/** Колонки листа из колонок таблицы antd (с группами «Группа · Колонка»). */
export function columnsFromTable<T>(
  columns: ColumnsType<T>,
  opts: { prefix?: string } = {},
): ExcelColumn<T>[] {
  const out: ExcelColumn<T>[] = [];
  for (const raw of columns) {
    const col = raw as ColumnType<T> & ExcelColumnExtra<T> & { children?: ColumnsType<T> };
    if (col.excelSkip || (col as { hidden?: boolean }).hidden) continue;
    const titleText = col.excelTitle ?? nodeText(col.title as ReactNode);
    const title = opts.prefix ? `${opts.prefix} · ${titleText}` : titleText;
    if (col.children && col.children.length) {
      out.push(...columnsFromTable(col.children, { prefix: titleText || opts.prefix }));
      continue;
    }
    const dataIndex = col.dataIndex;
    if (!title.trim() && dataIndex == null && !col.excelValue) continue; // кнопки действий
    out.push({
      title: title || String(dataIndex ?? ""),
      type: col.excelType,
      value: (row, index) => {
        if (col.excelValue) return col.excelValue(row, index);
        const value = dataIndex != null ? getPath(row, dataIndex) : undefined;
        // Числа и даты — из данных (там они без пробелов и «₸»). Коды вроде
        // «cash» или «posted» — подписью из таблицы («Наличные», «Проведён»).
        const isNumberLike =
          typeof value === "number" ||
          (typeof value === "string" && (NUMERIC.test(value.trim()) ||
            ISO_DATE.test(value.trim()) || ISO_DATETIME.test(value.trim())));
        if (dataIndex != null && (isNumberLike || value == null || !col.render)) {
          if (value == null || typeof value !== "object") return value;
        }
        if (col.render) {
          const rendered = col.render(value as never, row, index) as unknown;
          const node =
            rendered && typeof rendered === "object" && !isValidElement(rendered) &&
            "children" in (rendered as object)
              ? (rendered as { children: ReactNode }).children
              : (rendered as ReactNode);
          const text = nodeText(node).trim();
          if (text) return text;
        }
        return value;
      },
    });
  }
  return out;
}

/** Строки дерева (OLAP: клиент → товары) — плоским списком с отступом. */
export function flattenTree<T extends { children?: T[] | null }>(
  rows: T[],
  label: (row: T) => string,
): (T & { __depth: number; __label: string })[] {
  const out: (T & { __depth: number; __label: string })[] = [];
  const walk = (list: T[], depth: number) => {
    for (const r of list) {
      out.push({ ...r, __depth: depth, __label: `${"    ".repeat(depth)}${label(r)}` });
      if (r.children?.length) walk(r.children, depth + 1);
    }
  };
  walk(rows, 0);
  return out;
}

function safeSheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim() || "Лист";
  let n = 2;
  let candidate = base;
  while (used.has(candidate)) {
    const suffix = ` (${n++})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate);
  base = candidate;
  return base;
}

/** Собрать книгу и отдать браузеру на сохранение. */
export async function downloadExcel(fileName: string, sheets: ExcelSheet[]): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Pekarelli";
  wb.created = new Date();
  const used = new Set<string>();
  for (const sheet of sheets) {
    const ws = wb.addWorksheet(safeSheetName(sheet.name, used));
    let rowNo = 1;
    for (const line of sheet.caption ?? []) {
      ws.getCell(rowNo, 1).value = line;
      ws.getCell(rowNo, 1).font = rowNo === 1 ? { bold: true, size: 13 } : { color: { argb: "FF666666" } };
      rowNo += 1;
    }
    if (sheet.caption?.length) rowNo += 1;
    const headerRow = rowNo;
    sheet.columns.forEach((c, i) => {
      const cell = ws.getCell(headerRow, i + 1);
      cell.value = c.title;
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF3F6" } };
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: "FFB0B7BF" } } };
    });
    const widths = sheet.columns.map((c) => Math.max(8, Math.min(48, c.title.length + 2)));
    sheet.rows.forEach((row, ri) => {
      const r = headerRow + 1 + ri;
      sheet.columns.forEach((c, ci) => {
        const v = cellValue(c.value(row, ri), c.type);
        const cell = ws.getCell(r, ci + 1);
        cell.value = v as never;
        if (typeof v === "number") {
          cell.numFmt = c.type === "pct" ? "0.0" : Number.isInteger(v) ? "#,##0" : "#,##0.00";
        }
        const len = v == null ? 0 : String(v).length;
        widths[ci] = Math.max(widths[ci], Math.min(60, len + 2));
      });
    });
    let last = headerRow + sheet.rows.length;
    if (sheet.totals) {
      last += 1;
      sheet.columns.forEach((c, ci) => {
        const t = sheet.totals![c.title] ?? sheet.totals![String(ci)];
        const cell = ws.getCell(last, ci + 1);
        if (ci === 0 && t == null) cell.value = "Итого";
        else if (t != null) {
          const v = cellValue(t, c.type);
          cell.value = v as never;
          if (typeof v === "number") cell.numFmt = Number.isInteger(v) ? "#,##0" : "#,##0.00";
        }
        cell.font = { bold: true };
        cell.border = { top: { style: "thin", color: { argb: "FFB0B7BF" } } };
      });
    }
    widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
    ws.views = [{ state: "frozen", ySplit: headerRow }];
    if (sheet.columns.length && sheet.rows.length) {
      ws.autoFilter = {
        from: { row: headerRow, column: 1 },
        to: { row: headerRow + sheet.rows.length, column: sheet.columns.length },
      };
    }
  }
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileName.replace(/[\\/:*?"<>|]/g, " ").trim()} ${dayjs().format("YYYY-MM-DD")}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Кнопка «Excel». `sheets` может догружать данные (все страницы отчёта). */
export function ExcelExportButton({
  fileName,
  sheets,
  disabled,
  size,
  label = "Excel",
}: {
  fileName: string;
  sheets: () => ExcelSheet[] | Promise<ExcelSheet[]>;
  disabled?: boolean;
  size?: "small" | "middle" | "large";
  label?: string;
}) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  return (
    <Tooltip title="Выгрузить отчёт в Excel">
      <Button
        icon={<DownloadOutlined />}
        size={size}
        loading={busy}
        disabled={disabled}
        onClick={async () => {
          setBusy(true);
          try {
            const list = await sheets();
            if (!list.length || list.every((s) => s.rows.length === 0)) {
              message.info("Нет строк для выгрузки");
              return;
            }
            await downloadExcel(fileName, list);
          } catch (e) {
            message.error(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {label}
      </Button>
    </Tooltip>
  );
}
