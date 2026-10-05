import { Tooltip } from "antd";
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

import { NumText } from "@/components/format";

/** Самое мелкое, до чего ужимается число, — доля от исходного кегля. Мельче
 *  сумма перестаёт читаться, и честнее перенести её по разрядам. */
const MIN_SCALE = 0.55;

/** Число, которое никогда не вылезает из своей ячейки (плашка итога,
 *  клетка сетки): сперва уменьшается шрифт, а если не хватило и этого —
 *  строка переносится между разрядами. В широком месте выглядит как обычный
 *  текст. `full` — точное значение для подсказки, когда показано сокращённое. */
export function FitNumber({ children, full, className, style }: {
  children: ReactNode;
  full?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  // Меряем прямо по DOM, без состояния React: подгонка — чистая геометрия,
  // и лишний рендер ради неё только мигал бы.
  const fit = useCallback(() => {
    const box = boxRef.current;
    const text = textRef.current;
    if (!box || !text) return;
    text.style.fontSize = "";
    text.classList.remove("is-wrapped");
    const available = box.clientWidth;
    const natural = text.scrollWidth;
    if (available <= 0 || natural <= available) return;
    const scale = Math.max(MIN_SCALE, Math.floor((available / natural) * 100) / 100);
    text.style.fontSize = `${scale}em`;
    if (text.scrollWidth > available) text.classList.add("is-wrapped");
  }, []);

  // После каждого рендера: значение могло смениться (догрузились данные).
  useLayoutEffect(fit);

  // Ширина ячейки меняется без рендера: окно, свёрнутый сайдбар, перестройка
  // сетки. Подгонка — в следующем кадре: правка размеров прямо в колбэке
  // ResizeObserver даёт «loop completed with undelivered notifications»,
  // а это window.onerror — и лишний отчёт в телеметрию.
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    let width = box.clientWidth;
    const observer = new ResizeObserver(() => {
      if (box.clientWidth === width) return;
      width = box.clientWidth;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    });
    observer.observe(box);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [fit]);

  const text = (
    <span ref={textRef} className="num-fit-text">
      {typeof children === "string" ? <NumText text={children} /> : children}
    </span>
  );
  return (
    <span ref={boxRef} className={className ? `num-fit ${className}` : "num-fit"} style={style}>
      {full ? <Tooltip title={full}>{text}</Tooltip> : text}
    </span>
  );
}
