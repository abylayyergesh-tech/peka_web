/** Как показывать крупные числа, чтобы они не налезали друг на друга.
 *
 * Разряды в ru-RU разделены НЕРАЗРЫВНЫМ пробелом (U+00A0, в части сборок ICU —
 * узким U+202F), поэтому «12 345 678,90» для браузера одно слово: оно не
 * переносится и, не влезая в плашку или ячейку, ложится поверх соседней.
 * Здесь — что показывать в плашке и настройка пользователя; разбивка по
 * разрядам — `digitGroups` в format.tsx, компоненты — FitNumber.tsx и Stat.tsx. */
import { create } from "zustand";

import { fmtMoney, fmtQty } from "@/components/format";

/** С какого модуля сумма сокращается в режиме «Сокращённо». Меньшие числа и
 *  так короткие, а «850 тыс.» вместо «850 000» только запутывает. */
export const COMPACT_FROM = 1_000_000;

/** 12 345 678 -> "12,35 млн"; 1 234 567 890 -> "1,23 млрд". */
export function fmtCompact(n: number): string {
  return n.toLocaleString("ru-RU", { notation: "compact", maximumFractionDigits: 2 });
}

/** Сумма в целых тенге (ведомости, платежи — без копеек). */
export function fmtWhole(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

/** Чем является значение плашки: деньги с копейками, деньги в целых,
 *  количество (без хвостовых нулей), счётчик (целое). */
export type StatFormat = "money" | "whole" | "qty" | "count";

export type NumberMode = "full" | "compact";

/** Текст плашки. `full` заполнен, только когда число сокращено: его
 *  показывает подсказка, чтобы точная сумма не терялась. */
export function statText(
  value: string | number | null | undefined,
  format: StatFormat | undefined,
  mode: NumberMode,
): { text: string; full?: string } {
  if (value == null || value === "") return { text: "—" };
  const n = typeof value === "number" ? value : Number(value);
  if (!format) {
    // Без формата строка — уже готовая надпись («3 / 10», название склада).
    return { text: typeof value === "number" ? fmtQty(value) : value };
  }
  if (Number.isNaN(n)) return { text: String(value) };
  const full =
    format === "money" ? fmtMoney(n)
      : format === "whole" ? fmtWhole(n)
        : fmtQty(n);
  // Счётчики (чеков, позиций) не сокращаем: «1,2 тыс. чеков» хуже, чем 1 234.
  if (mode === "compact" && format !== "count" && Math.abs(n) >= COMPACT_FROM) {
    return { text: fmtCompact(n), full };
  }
  return { text: full };
}

// ---------------------------------------------------------------- настройка

const MODE_KEY = "peka-web:number-display:v1";

function readMode(): NumberMode {
  try {
    return localStorage.getItem(MODE_KEY) === "compact" ? "compact" : "full";
  } catch {
    return "full";
  }
}

/** Выбор пользователя хранится в браузере: это вкус смотрящего, а не данные
 *  организации. Без хранилища (приватный режим) — живёт до перезагрузки. */
export const useNumberDisplay = create<{
  mode: NumberMode;
  setMode: (mode: NumberMode) => void;
}>((set) => ({
  mode: readMode(),
  setMode: (mode) => {
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* без хранилища — до перезагрузки */
    }
    set({ mode });
  },
}));
