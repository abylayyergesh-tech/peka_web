/** Поиск + серверная сортировка для списочных страниц.
 *
 * Списки грузятся страницами (limit/offset), поэтому и фильтровать, и сортировать
 * обязан сервер: искать по одной загруженной странице из 998 продуктов —
 * значит врать пользователю. Здесь только состояние и перевод сортировки antd
 * в параметр `sort` API (`name` / `-name`, см. core/pagination.resolve_sort).
 */
import type { SorterResult } from "antd/es/table/interface";
import { useEffect, useState } from "react";

/** Значение, «отстающее» на delay мс — чтобы не дёргать API на каждую букву. */
export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Сортировка antd -> параметр `sort` API. Снятие сортировки -> undefined. */
export function sorterToParam<T>(
  sorter: SorterResult<T> | SorterResult<T>[],
): string | undefined {
  const s = Array.isArray(sorter) ? sorter[0] : sorter;
  if (!s || !s.order || !s.field) return undefined;
  const field = Array.isArray(s.field) ? s.field.join(".") : String(s.field);
  return s.order === "descend" ? `-${field}` : field;
}

export interface ListControlsOptions {
  /** Вызывается при смене поиска/сортировки — обычно `reset` из usePagination,
   *  чтобы уехать на первую страницу: это другой набор строк. */
  onReset?: () => void;
  /** Переименование поля колонки в имя поля API: у тех-карт колонка показывает
   *  `product_id`, а сортировать надо по `product` (названию изделия). */
  fieldMap?: Record<string, string>;
}

/** Состояние поиска и сортировки для списочной страницы. */
export function useListControls<T>({ onReset, fieldMap }: ListControlsOptions = {}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<string | undefined>();
  const debouncedSearch = useDebounced(search);

  // Новый поиск/сортировка — другой набор строк, старое смещение не подходит.
  useEffect(() => {
    onReset?.();
    // onReset — новая функция на каждый рендер, в зависимости её не берём
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, sort]);

  return {
    /** Значение поля ввода (мгновенное). */
    search,
    setSearch,
    /** Значение для запроса (с задержкой). */
    searchParam: debouncedSearch.trim() || undefined,
    sort,
    /** Готовый обработчик для <Table onChange={...}>. */
    onTableChange: (
      _pagination: unknown,
      _filters: unknown,
      sorter: SorterResult<T> | SorterResult<T>[],
    ) => {
      const param = sorterToParam(sorter);
      if (!param || !fieldMap) return setSort(param);
      const desc = param.startsWith("-");
      const field = desc ? param.slice(1) : param;
      const mapped = fieldMap[field] ?? field;
      setSort(desc ? `-${mapped}` : mapped);
    },
  };
}
