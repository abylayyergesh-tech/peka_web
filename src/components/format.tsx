/** Shared display formatting: money (backend Decimal-as-string) and dates. */
import dayjs from "dayjs";
import { Fragment } from "react";

const CURRENCY = (import.meta.env.VITE_CURRENCY as string | undefined) ?? "";

/** "12345.60" -> "12 345,60" (+ currency suffix when configured). */
export function fmtMoney(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return String(value);
  const s = n.toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return CURRENCY ? `${s} ${CURRENCY}` : s;
}

/** Quantities: trim trailing zeros, ru-RU separators. */
export function fmtQty(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 6 });
}

export function fmtDate(value: string | null | undefined): string {
  return value ? dayjs(value).format("DD.MM.YYYY") : "—";
}

export function fmtDateTime(value: string | null | undefined): string {
  return value ? dayjs(value).format("DD.MM.YYYY HH:mm") : "—";
}

/** Куски числа, после каждого из которых можно перенести строку:
 *  "12 345 678,90" -> ["12 ", "345 ", "678,90"]. Разряды в ru-RU разделены
 *  НЕРАЗРЫВНЫМ пробелом (U+00A0, в части сборок ICU — узким U+202F), и без
 *  этой разбивки сумма для браузера — одно слово, которое не переносится. */
export function digitGroups(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\u00a0" || text[i] === "\u202f") {
      parts.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < text.length) parts.push(text.slice(start));
  return parts;
}

/** Число с местами для переноса между разрядами (<wbr>). Внутри `.num` и
 *  FitNumber эти места выключены и включаются CSS только там, где ячейка не
 *  раздвигается (index.css, «Числа»); при копировании их не видно. */
export function NumText({ text }: { text: string }) {
  return (
    <>
      {digitGroups(text).map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <wbr />}
          {part}
        </Fragment>
      ))}
    </>
  );
}

/** Сумма в одну строку. Класс `num` (index.css) разрешает перенос по
 *  разрядам там, где колонка не раздвигается, — вместо наезда на соседа. */
export function Money({ value }: { value: string | number | null | undefined }) {
  return (
    <span className="num">
      <NumText text={fmtMoney(value)} />
    </span>
  );
}
