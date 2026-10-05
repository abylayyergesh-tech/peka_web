import { Statistic } from "antd";
import type { CSSProperties, ReactNode } from "react";

import { FitNumber } from "@/components/FitNumber";
import { NumText } from "@/components/format";
import { statText, useNumberDisplay, type StatFormat } from "@/components/numberDisplay";

/** Плашка итога — antd Statistic, у которой значение не вылезает за карточку
 *  (FitNumber): крупная сумма в узкой колонке ужимается, а не ложится на
 *  соседнюю плашку.
 *
 *  Числа передавать СЫРЫМИ вместе с `format` — тогда плашка форматирует их
 *  сама и слушается настройки «Отображение чисел» (сокращение до «12,3 млн»
 *  с точной суммой в подсказке). Строка без `format` — готовая надпись
 *  («3 / 10», название склада) и показывается как есть. `prefix`/`suffix`
 *  живут в той же строке и ужимаются вместе с числом. */
export default function Stat({ title, value, format, valueStyle, loading, prefix, suffix }: {
  title: ReactNode;
  value: string | number | null | undefined;
  format?: StatFormat;
  valueStyle?: CSSProperties;
  loading?: boolean;
  prefix?: ReactNode;
  suffix?: ReactNode;
}) {
  const mode = useNumberDisplay((s) => s.mode);
  const shown = statText(value, format, mode);
  return (
    <Statistic
      title={title}
      loading={loading}
      valueStyle={valueStyle}
      valueRender={() => (
        <FitNumber full={shown.full}>
          {prefix && <span className="stat-prefix">{prefix}</span>}
          <NumText text={shown.text} />
          {suffix && <span className="stat-suffix">{suffix}</span>}
        </FitNumber>
      )}
    />
  );
}
