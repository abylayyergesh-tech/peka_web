/** Shared reference-data queries for selects and id->name lookups. */
import { useQuery } from "@tanstack/react-query";

import {
  listAllSuppliers,
  listProductRefs,
  listUnitRefs,
  listWarehouseRefs,
  type ProductRef,
  type UnitRef,
} from "@/api/procurement";

export interface SelectOption {
  value: number;
  label: string;
}

export function useProductRefs() {
  const query = useQuery({
    queryKey: ["procurement", "product-refs"],
    queryFn: listProductRefs,
    staleTime: 60_000,
  });
  const all = query.data ?? [];
  const byId = new Map<number, ProductRef>(all.map((p) => [p.product_id, p]));
  const options: SelectOption[] = all
    .filter((p) => p.is_active)
    .map((p) => ({ value: p.product_id, label: p.name }));
  /** Lookup tolerant to not-yet-filled form values. */
  function get(id: number | null | undefined): ProductRef | undefined {
    return id == null ? undefined : byId.get(id);
  }
  return { byId, get, options, isPending: query.isPending };
}

export function useUnitRefs() {
  const query = useQuery({
    queryKey: ["procurement", "unit-refs"],
    queryFn: listUnitRefs,
    staleTime: 60_000,
  });
  const all = query.data ?? [];
  const byId = new Map<number, UnitRef>(all.map((u) => [u.unit_id, u]));
  const options: SelectOption[] = all.map((u) => ({ value: u.unit_id, label: u.name }));

  /** Units usable for a product: same dimension as the product's base unit. */
  function optionsForProduct(product: ProductRef | undefined): SelectOption[] {
    if (!product) return options;
    const base = byId.get(product.base_unit_id);
    if (!base) return options;
    return all
      .filter((u) => u.dimension === base.dimension)
      .map((u) => ({ value: u.unit_id, label: u.name }));
  }

  return { byId, options, optionsForProduct, isPending: query.isPending };
}

export function useWarehouseRefs() {
  const query = useQuery({
    queryKey: ["procurement", "warehouse-refs"],
    queryFn: listWarehouseRefs,
    staleTime: 60_000,
  });
  const all = query.data ?? [];
  const byId = new Map<number, string>(all.map((w) => [w.warehouse_id, w.name]));
  const options: SelectOption[] = all
    .filter((w) => w.is_active)
    .map((w) => ({ value: w.warehouse_id, label: w.name }));
  return { byId, options, isPending: query.isPending };
}

export function useSupplierRefs() {
  const query = useQuery({
    queryKey: ["procurement", "supplier-refs", "all"],
    queryFn: listAllSuppliers,
    staleTime: 60_000,
  });
  const all = query.data ?? [];
  const byId = new Map<number, string>(all.map((s) => [s.supplier_id, s.name]));
  const options: SelectOption[] = all.map((s) => ({ value: s.supplier_id, label: s.name }));
  const activeOptions: SelectOption[] = all
    .filter((s) => s.is_active)
    .map((s) => ({ value: s.supplier_id, label: s.name }));
  return { byId, options, activeOptions, isPending: query.isPending };
}

/** Empty form strings -> null so optional backend fields are cleared, not "". */
export function nullIfEmpty(v: string | null | undefined): string | null {
  return v ? v : null;
}
