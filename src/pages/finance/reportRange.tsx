/** Период отчёта: один пикер на три отчёта, чтобы окно везде задавалось одинаково.
 *
 *  По умолчанию — текущий месяц: это то, за что спрашивают чаще всего, и отчёт
 *  открывается сразу с цифрами, а не с пустым экраном. */
import { DatePicker } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";

export type Range = [Dayjs, Dayjs];

export function useReportRange(): {
  range: Range;
  setRange: (r: Range) => void;
  params: { from: string; to: string };
} {
  const [range, setRange] = useState<Range>([dayjs().startOf("month"), dayjs()]);
  return {
    range,
    setRange,
    params: { from: range[0].format("YYYY-MM-DD"), to: range[1].format("YYYY-MM-DD") },
  };
}

export function ReportRangePicker({
  value,
  onChange,
}: {
  value: Range;
  onChange: (r: Range) => void;
}) {
  return (
    <DatePicker.RangePicker
      format="DD.MM.YYYY"
      allowClear={false}
      value={value}
      onChange={(v) => {
        if (v && v[0] && v[1]) onChange([v[0], v[1]]);
      }}
      presets={[
        { label: "Сегодня", value: [dayjs(), dayjs()] },
        { label: "7 дней", value: [dayjs().subtract(6, "day"), dayjs()] },
        { label: "30 дней", value: [dayjs().subtract(29, "day"), dayjs()] },
        { label: "Этот месяц", value: [dayjs().startOf("month"), dayjs()] },
        {
          label: "Прошлый месяц",
          value: [
            dayjs().subtract(1, "month").startOf("month"),
            dayjs().subtract(1, "month").endOf("month"),
          ],
        },
      ]}
    />
  );
}
