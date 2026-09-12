/** Shared bits for the inventory/reports pages: RU labels for document
 *  type/status, coloured Tags, and cached lookup hooks (products, warehouses,
 *  suppliers) used by document forms and report filters. */
import { Tag } from "antd";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchAllPages } from "@/api/client";
import {
  listProducts,
  listSuppliers,
  listWarehouses,
  type DocumentStatus,
  type DocumentType,
  type ProductOut,
  type SupplierOut,
  type WarehouseOut,
  type WarehousePurpose,
} from "@/api/inventory";

export const WAREHOUSE_PURPOSE_LABELS: Record<WarehousePurpose, string> = {
  raw: "Сырьё",
  finished: "Готовая продукция",
};

export function warehouseLabel(w: Pick<WarehouseOut, "name" | "purpose">): string {
  const suffix = w.purpose === "finished" ? "ГП" : "сырьё";
  return `${w.name} (${suffix})`;
}

export const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  receipt: "Приход",
  write_off: "Списание",
  transfer: "Перемещение",
  production: "Производство",
  sale: "Реализация",
  inventory_count: "Инвентаризация",
};

const DOC_TYPE_COLORS: Record<DocumentType, string> = {
  receipt: "green",
  write_off: "red",
  transfer: "blue",
  production: "purple",
  sale: "orange",
  inventory_count: "gold",
};

export const DOC_TYPE_OPTIONS = (
  Object.keys(DOC_TYPE_LABELS) as DocumentType[]
).map((t) => ({ value: t, label: DOC_TYPE_LABELS[t] }));

export const DOC_STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: "Черновик",
  posted: "Проведён",
};

const DOC_STATUS_COLORS: Record<DocumentStatus, string> = {
  draft: "default",
  posted: "green",
};

export const DOC_STATUS_OPTIONS = (
  Object.keys(DOC_STATUS_LABELS) as DocumentStatus[]
).map((s) => ({ value: s, label: DOC_STATUS_LABELS[s] }));

/** Списание открывается своей карточкой, остальные — общей формой документа. */
export function documentPath(
  type: DocumentType | string | null | undefined,
  documentId: number,
): string {
  return type === "write_off"
    ? `/write-offs/${documentId}`
    : `/documents/${documentId}`;
}

export function DocTypeTag({ type }: { type: DocumentType }) {
  return <Tag color={DOC_TYPE_COLORS[type]}>{DOC_TYPE_LABELS[type] ?? type}</Tag>;
}

export function DocStatusTag({ status }: { status: DocumentStatus }) {
  return (
    <Tag color={DOC_STATUS_COLORS[status]}>{DOC_STATUS_LABELS[status] ?? status}</Tag>
  );
}

/** True only for the two document types the detail page can safely PATCH back
 *  (DocumentOut omits receipt's supplier_id/internal/free_goods — see notes). */
export function isConsumptionType(type: DocumentType): boolean {
  return (
    type === "write_off" ||
    type === "transfer" ||
    type === "production" ||
    type === "sale"
  );
}

interface Lookup<T> {
  items: T[];
  byId: Map<number, T>;
  options: { value: number; label: string }[];
  isPending: boolean;
}

export function useProductsLookup(): Lookup<ProductOut> {
  const q = useQuery({
    queryKey: ["lookup", "products", "all"],
    // Продуктов ~1000, а страница у API максимум 200: без обхода всех страниц
    // в отчётах вместо названий оставались «#id».
    queryFn: () => fetchAllPages((pg) => listProducts(pg)),
    staleTime: 60_000,
  });
  const items = q.data ?? [];
  return {
    items,
    byId: useMemo(() => new Map(items.map((p) => [p.product_id, p])), [items]),
    options: useMemo(
      () => items.map((p) => ({ value: p.product_id, label: p.name })),
      [items],
    ),
    isPending: q.isPending,
  };
}

export function useWarehousesLookup(): Lookup<WarehouseOut> {
  const q = useQuery({
    queryKey: ["lookup", "warehouses", "all"],
    queryFn: () => fetchAllPages((pg) => listWarehouses({ ...pg, include_inactive: true })),
    staleTime: 60_000,
  });
  const items = q.data ?? [];
  return {
    items,
    byId: useMemo(() => new Map(items.map((w) => [w.warehouse_id, w])), [items]),
    // active-only options for pickers; the map above still resolves inactive names
    options: useMemo(
      () =>
        items
          .filter((w) => w.is_active)
          .map((w) => ({ value: w.warehouse_id, label: warehouseLabel(w) })),
      [items],
    ),
    isPending: q.isPending,
  };
}

export function useSuppliersLookup(): Lookup<SupplierOut> {
  const q = useQuery({
    queryKey: ["lookup", "suppliers", "all"],
    // Поставщиков ~700 — та же причина, что и с продуктами.
    queryFn: () => fetchAllPages((pg) => listSuppliers(pg)),
    staleTime: 60_000,
  });
  const items = q.data ?? [];
  return {
    items,
    byId: useMemo(() => new Map(items.map((s) => [s.supplier_id, s])), [items]),
    options: useMemo(
      () => items.map((s) => ({ value: s.supplier_id, label: s.name })),
      [items],
    ),
    isPending: q.isPending,
  };
}

/** Resolve a product/warehouse name from a lookup map, falling back to #id. */
export function nameOf<T extends { name: string }>(
  byId: Map<number, T>,
  id: number | null | undefined,
): string {
  if (id == null) return "—";
  return byId.get(id)?.name ?? `#${id}`;
}

/** Склад, который в цехе называют основным. Тот же порядок, что у кассы:
 *  точное «Основной склад», затем «Основной …», затем вхождение, затем первый.
 *  Свободный поиск «основн» нельзя: есть «Основное средство». */
export function pickMainWarehouse<T extends { name: string }>(
  list: T[],
): T | null {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const target = "основной склад";
  return (
    list.find((w) => norm(w.name) === target) ??
    list.find((w) => /^основной\b/i.test(norm(w.name))) ??
    list.find((w) => norm(w.name).includes(target)) ??
    list[0] ??
    null
  );
}
