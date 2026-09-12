/** Shared Select options + id->name resolvers for products and units.
 * The backend caps a page at 200 rows and has no name-search param, so we
 * paginate through ALL rows and filter client-side. (Loading only the first
 * page made large catalogs — 1000+ products — render unresolved recipe
 * components as raw "#<id>" numbers instead of names.) */
import { useQuery } from "@tanstack/react-query";

import type { Page, PageParams } from "@/api/client";
import { listProducts, listUnits, type ProductOut, type UnitOut } from "@/api/catalog";

export interface IdOption {
  value: number;
  label: string;
}

const PAGE = 200; // endpoint's max page size (le=200)

/** Fetch every page and concatenate the items. */
async function fetchAll<T>(fetchPage: (p: PageParams) => Promise<Page<T>>): Promise<T[]> {
  const all: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await fetchPage({ limit: PAGE, offset });
    all.push(...page.items);
    if (page.items.length === 0 || all.length >= page.total) break;
  }
  return all;
}

export function useProductOptions() {
  const query = useQuery({
    queryKey: ["products", "options", "all"],
    queryFn: () => fetchAll((p) => listProducts({ ...p, include_inactive: true })),
    staleTime: 60_000,
  });
  const items = query.data ?? [];
  const byId = new Map(items.map((p) => [p.product_id, p.name]));
  const byProduct = new Map(items.map((p) => [p.product_id, p]));
  const options: IdOption[] = items.map((p) => ({
    value: p.product_id,
    label: p.sku ? `${p.name} · ${p.sku}` : p.name,
  }));
  const nameOf = (id: number | null | undefined): string =>
    id == null ? "—" : byId.get(id) ?? `#${id}`;
  const productOf = (id: number | null | undefined): ProductOut | undefined =>
    id == null ? undefined : byProduct.get(id);
  return { options, nameOf, productOf, items, isLoading: query.isPending };
}

export function useUnitOptions() {
  const query = useQuery({
    queryKey: ["units", "options", "all"],
    queryFn: () => fetchAll((p) => listUnits(p)),
    staleTime: 60_000,
  });
  const items = query.data ?? [];
  const byId = new Map(items.map((u) => [u.unit_id, u.name]));
  const byUnit = new Map(items.map((u) => [u.unit_id, u]));
  const options: IdOption[] = items.map((u) => ({ value: u.unit_id, label: u.name }));
  const nameOf = (id: number | null | undefined): string =>
    id == null ? "—" : byId.get(id) ?? `#${id}`;
  const unitOf = (id: number | null | undefined): UnitOut | undefined =>
    id == null ? undefined : byUnit.get(id);
  return { options, nameOf, unitOf, items, isLoading: query.isPending };
}
