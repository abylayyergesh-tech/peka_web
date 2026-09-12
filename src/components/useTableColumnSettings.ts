/** Какие колонки видны в таблице: привычка оператора, не политика организации.

  Ключ — таблица + пользователь + орг: у бухгалтера и у кассира разные наборы,
  и чужая организация не должна подхватить чужой расклад.

  Храним скрытые колонки, а не видимые: новая колонка по умолчанию «вкл»
  появится сама. Новая «выкл» подмешается через `seen`. */
import { useEffect, useState } from "react";

import { useAuthStore } from "@/auth/store";

export interface TableColumnSpec {
  key: string;
  label: string;
  /** Нет в сохранённых — показать. Явный false — спрятать, пока не включат. */
  defaultVisible?: boolean;
  /** Всегда на экране: название и действия. В списке настроек — серая галка. */
  locked?: boolean;
}

type Stored = { hidden: string[]; seen: string[] };

function storageKey(tableId: string, userId: number | null, orgId: number | null): string {
  return `peka.table.columns.${tableId}:${userId ?? 0}:${orgId ?? 0}`;
}

function readStored(key: string): Stored | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    if (!Array.isArray(parsed.hidden) || !Array.isArray(parsed.seen)) return null;
    return {
      hidden: parsed.hidden.filter((x): x is string => typeof x === "string"),
      seen: parsed.seen.filter((x): x is string => typeof x === "string"),
    };
  } catch {
    return null;
  }
}

function defaultHidden(specs: TableColumnSpec[]): string[] {
  return specs
    .filter((s) => !s.locked && s.defaultVisible === false)
    .map((s) => s.key);
}

function mergeHidden(specs: TableColumnSpec[], stored: Stored | null): string[] {
  const known = new Set(specs.map((s) => s.key));
  if (!stored) return defaultHidden(specs);
  const hidden = new Set(stored.hidden.filter((k) => known.has(k)));
  for (const spec of specs) {
    if (spec.locked) continue;
    if (!stored.seen.includes(spec.key) && spec.defaultVisible === false) {
      hidden.add(spec.key);
    }
  }
  return [...hidden];
}

export function useTableColumnSettings(tableId: string, specs: TableColumnSpec[]) {
  const userId = useAuthStore((s) => s.me?.user_id ?? null);
  const orgId = useAuthStore((s) => s.activeOrgId);
  const key = storageKey(tableId, userId, orgId);

  const [hidden, setHidden] = useState<string[]>(() => mergeHidden(specs, readStored(key)));

  useEffect(() => {
    setHidden(mergeHidden(specs, readStored(key)));
  }, [key]);

  function persist(next: string[]) {
    const seen = specs.map((s) => s.key);
    try {
      localStorage.setItem(key, JSON.stringify({ hidden: next, seen }));
    } catch {
      /* приватный режим: настройка живёт до перезагрузки */
    }
    setHidden(next);
  }

  function isVisible(colKey: string): boolean {
    const spec = specs.find((s) => s.key === colKey);
    if (spec?.locked) return true;
    return !hidden.includes(colKey);
  }

  function setVisibleKeys(visibleKeys: string[]) {
    persist(
      specs.filter((s) => !s.locked && !visibleKeys.includes(s.key)).map((s) => s.key),
    );
  }

  function reset() {
    persist(defaultHidden(specs));
  }

  return { hidden, isVisible, setVisibleKeys, reset, specs };
}

export type TableColumnSettingsState = ReturnType<typeof useTableColumnSettings>;
