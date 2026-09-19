import { Tour } from "antd";
import { useEffect, useState } from "react";
import type { NavSection } from "@/layout/menu";
import { introductionSteps, tourStorageKey } from "@/layout/onboarding";

// Also works when browser storage is disabled (once per running application).
const acknowledged = new Set<string>();
function hasSeen(key: string) {
  if (acknowledged.has(key)) return true;
  try { return localStorage.getItem(key) === "done"; } catch { return false; }
}

export default function OnboardingTour({ identity, ready, sections, restart, prepare }: {
  identity: string; ready: boolean; sections: NavSection[]; restart: number; prepare: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(0);
  const key = tourStorageKey(identity);

  useEffect(() => {
    setOpen(false);
    setCurrent(0);
    if (!ready || (restart === 0 && hasSeen(key))) return;
    prepare();
    const frame = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(frame);
  }, [key, ready, restart, prepare]);

  function finish() {
    acknowledged.add(key);
    try { localStorage.setItem(key, "done"); } catch { /* in-memory fallback */ }
    setOpen(false);
  }

  const descriptions = introductionSteps(sections);
  return <Tour open={open && ready} current={current} onChange={setCurrent}
    onClose={finish} onFinish={finish} disabledInteraction
    closable={{ "aria-label": "Пропустить знакомство" }}
    indicatorsRender={(step, total) => <span>{step + 1} из {total}</span>}
    steps={descriptions.map((step, index) => ({
      title: step.title, description: step.description,
      target: step.selector ? () => document.querySelector<HTMLElement>(step.selector!)! : null,
      prevButtonProps: { children: "Назад" },
      nextButtonProps: { children: index === descriptions.length - 1 ? "Начать работу" : "Далее" },
    }))} />;
}
