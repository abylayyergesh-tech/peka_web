/** Сумма скрыта, пока не нажмут. Цифры уже в ответе API — это защита от
 *  плеча соседа, не от DevTools. */
import { useState } from "react";

function fmtTenge(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

export function HiddenMoney({
  value,
  format = fmtTenge,
}: {
  value: string | number | null | undefined;
  format?: (v: string | number | null | undefined) => string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setOpen((v) => !v);
      }}
      title={open ? "Скрыть сумму" : "Показать сумму"}
      style={{
        border: 0,
        background: "transparent",
        padding: 0,
        cursor: "pointer",
        font: "inherit",
        fontVariantNumeric: "tabular-nums",
        letterSpacing: open ? "normal" : "0.12em",
        color: "inherit",
      }}
    >
      {open ? format(value) : "••••"}
    </button>
  );
}
