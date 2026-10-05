import { BulbOutlined, CheckCircleFilled, RightOutlined, UnorderedListOutlined } from "@ant-design/icons";
import { Button, Modal, Tour } from "antd";
import type { TourProps } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { NavSection } from "@/layout/menu";
import {
  readProgress, saveProgress, stepsLabel, tourChapters, tourStorageKey,
  type TourChapter, type TourProgress, type TourStep,
} from "@/layout/onboarding";

/** Что тур просит у раскладки на время шага: раскрыть раздел меню и выделить
 *  в нём пункты. `null` — тур закончился, меню вернуть как было до него. */
export type TourFocus = { section?: string; spot: string[] } | null;

/** Элемент, который подсвечивает шаг. Для шага по разделу — пункт меню
 *  раздела целиком, вместе с раскрытым списком экранов. */
function stepTarget(step: TourStep): HTMLElement | null {
  if (step.section) {
    const title = document.querySelector(`[data-tour-section='${step.section}']`);
    return title?.closest<HTMLElement>("li.ant-menu-submenu") ?? null;
  }
  return step.selector ? document.querySelector<HTMLElement>(step.selector) : null;
}

function StepBody({ step, nextChapter, onLink, onChapters, onNextChapter }: {
  step: TourStep;
  nextChapter?: TourChapter;
  onLink: (path: string) => void;
  onChapters: () => void;
  onNextChapter: () => void;
}) {
  return (
    <div className="tour-body">
      {step.text && <p className="tour-text">{step.text}</p>}
      {step.items && (
        <dl className="tour-items">
          {step.items.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              {item.hint && <dd>{item.hint}</dd>}
            </div>
          ))}
        </dl>
      )}
      {step.howto && (
        <ol className="tour-howto">
          {step.howto.map((line) => <li key={line}>{line}</li>)}
        </ol>
      )}
      {step.tip && (
        <p className="tour-tip">
          <BulbOutlined aria-hidden /> <span>{step.tip}</span>
        </p>
      )}
      {(step.link || step.showChapters || nextChapter) && (
        <div className="tour-actions">
          {step.link && (
            <Button size="small" onClick={() => onLink(step.link!.path)}>
              Открыть «{step.link.label}» <RightOutlined />
            </Button>
          )}
          {step.showChapters && (
            <Button size="small" icon={<UnorderedListOutlined />} onClick={onChapters}>
              Все главы
            </Button>
          )}
          {nextChapter && (
            <Button size="small" type="link" onClick={onNextChapter}>
              Дальше: «{nextChapter.title}» <RightOutlined />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default function OnboardingTour({ identity, ready, sections, openChapters, prepare, onFocus }: {
  identity: string;
  ready: boolean;
  sections: NavSection[];
  /** Счётчик из меню профиля: увеличился — показать оглавление глав. */
  openChapters: number;
  /** Подготовить экран к туру (развернуть свёрнутое меню). */
  prepare: () => void;
  onFocus: (focus: TourFocus) => void;
}) {
  const navigate = useNavigate();
  const key = tourStorageKey(identity);
  const chapters = useMemo(() => tourChapters(sections), [sections]);
  const [progress, setProgress] = useState<TourProgress>(() => readProgress(key));
  const [active, setActive] = useState<TourChapter | null>(null);
  const [current, setCurrent] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);

  const start = useCallback((chapterKey: string) => {
    const chapter = chapters.find((c) => c.key === chapterKey);
    if (!chapter) return;
    prepare();
    setPickerOpen(false);
    setCurrent(0);
    setActive(chapter);
  }, [chapters, prepare]);

  // Другой человек или другая организация — свой прогресс. Обзор открывается
  // сам один раз; дальше — только из меню профиля.
  useEffect(() => {
    setActive(null);
    setPickerOpen(false);
    const saved = readProgress(key);
    setProgress(saved);
    if (!ready || saved.seen) return;
    const frame = requestAnimationFrame(() => start("overview"));
    return () => cancelAnimationFrame(frame);
    // Без `start` в зависимостях намеренно: он меняется вместе с разделами,
    // а перезапускать из-за этого обзор не нужно.
  }, [key, ready]);

  useEffect(() => {
    if (openChapters === 0) return;
    setActive(null);
    setPickerOpen(true);
  }, [openChapters]);

  const step = active?.steps[current];

  useEffect(() => {
    if (step) onFocus({ section: step.section, spot: step.spot ?? [] });
  }, [step, onFocus]);

  const close = useCallback((completed: boolean) => {
    if (!active) return;
    const next: TourProgress = {
      seen: true,
      done: completed && !progress.done.includes(active.key)
        ? [...progress.done, active.key] : progress.done,
    };
    setProgress(next);
    saveProgress(key, next);
    setActive(null);
    onFocus(null);
  }, [active, progress, key, onFocus]);

  // rc-tour пересчитывает рамку подсветки только по resize окна. А раздел
  // меню раскрывается анимацией, сайдбар разворачивается из значков — рамка
  // оставалась на месте прежнего размера. Ловим изменения размеров сами.
  useEffect(() => {
    if (!active || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    });
    const sider = document.querySelector("[data-tour='sidebar']");
    if (sider) observer.observe(sider);
    const menu = sider?.querySelector(".ant-menu-root");
    if (menu) observer.observe(menu);
    const target = step ? stepTarget(step) : null;
    if (target) observer.observe(target);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [active, step]);

  const total = active?.steps.length ?? 0;
  const go = useCallback((index: number) => {
    if (index < 0) return;
    if (index >= total) close(true);
    else setCurrent(index);
  }, [total, close]);

  // Клавиатура: в rc-tour её нет. Поля ввода не перехватываем.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("input, textarea, [contenteditable='true']")) return;
      if (e.key === "ArrowRight") go(current + 1);
      else if (e.key === "ArrowLeft") go(current - 1);
      else if (e.key === "Escape") close(false);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, current, go, close]);

  const chapterIndex = active ? chapters.findIndex((c) => c.key === active.key) : -1;
  const nextChapter = chapterIndex >= 0 ? chapters[chapterIndex + 1] : undefined;

  const steps: TourProps["steps"] = (active?.steps ?? []).map((s, index) => {
    const last = index === total - 1;
    return {
      title: s.title,
      description: (
        <StepBody
          step={s}
          nextChapter={last ? nextChapter : undefined}
          onLink={(path) => {
            close(false);
            navigate(path);
          }}
          onChapters={() => {
            close(true);
            setPickerOpen(true);
          }}
          onNextChapter={() => {
            close(true);
            if (nextChapter) start(nextChapter.key);
          }}
        />
      ),
      // null — шаг по центру экрана (антд так и понимает пустую цель).
      target: (() => stepTarget(s)) as () => HTMLElement,
      placement: s.section || s.selector === "[data-tour='sidebar']" ? "right" : undefined,
      prevButtonProps: { children: "Назад" },
      nextButtonProps: { children: last ? "Готово" : "Далее" },
    };
  });

  return (
    <>
      <Tour
        open={!!active && ready}
        current={current}
        onChange={setCurrent}
        onClose={() => close(false)}
        onFinish={() => close(true)}
        disabledInteraction
        // Рамка вплотную: сайдбар и шапка прижаты к краю окна, а со штатным
        // отступом 6px маска уходила в минус («<rect> attribute height:
        // A negative value»). Скругление — как у карточек.
        gap={{ offset: 0, radius: 12 }}
        rootClassName="peka-tour"
        closable={{ "aria-label": "Закрыть знакомство" }}
        indicatorsRender={(index, count) => (
          <span className="tour-counter">
            {active?.title} · {index + 1} из {count}
          </span>
        )}
        steps={steps}
      />
      <Modal
        open={pickerOpen}
        title="Знакомство с системой"
        footer={null}
        width={640}
        onCancel={() => setPickerOpen(false)}
      >
        <p className="tour-picker-lead">
          Выберите главу. В каждой — экраны раздела с подсветкой в меню и пошаговые
          инструкции с точными названиями кнопок. Закрыть главу можно в любой момент.
        </p>
        <div className="tour-chapters">
          {chapters.map((chapter) => {
            const done = progress.done.includes(chapter.key);
            return (
              <button
                key={chapter.key}
                type="button"
                className="tour-chapter"
                onClick={() => start(chapter.key)}
              >
                <span className="tour-chapter-title">
                  {chapter.title}
                  {done && <CheckCircleFilled className="tour-chapter-done" aria-label="пройдена" />}
                </span>
                <span className="tour-chapter-summary">{chapter.summary}</span>
                <span className="tour-chapter-meta">
                  {stepsLabel(chapter.steps.length)}
                  {done ? " · пройдена" : ""}
                </span>
              </button>
            );
          })}
        </div>
      </Modal>
    </>
  );
}
