/** Shared Select options + id->name resolvers for products and units.
 * Backend GET /products has no name-search param, so options are filtered
 * client-side; we load up to 200 active rows (the endpoint's max page). */
import { useQuery } from "@tanstack/react-query";

import { listProducts, listUnits } from "@/api/catalog";

export interface IdOption {
  value: number;
  label: string;
}

const OPTIONS_LIMIT = 200;

export function useProductOptions() {
  const query = useQuery({
    queryKey: ["products", "options"],
    queryFn: () => listProducts({ limit: OPTIONS_LIMIT, offset: 0 }),
    staleTime: 60_000,
  });
  const items = query.data?.items ?? [];
  const byId = new Map(items.map((p) => [p.id, p.name]));
  const options: IdOption[] = items.map((p) => ({ value: p.id, label: p.name }));
  const nameOf = (id: number | null | undefined): string =>
    id == null ? "—" : byId.get(id) ?? `#${id}`;
  return { options, nameOf, isLoading: query.isPending };
}

export function useUnitOptions() {
  const query = useQuery({
    queryKey: ["units", "options"],
    queryFn: () => listUnits({ limit: OPTIONS_LIMIT, offset: 0 }),
    staleTime: 60_000,
  });
  const items = query.data?.items ?? [];
  const byId = new Map(items.map((u) => [u.id, u.name]));
  const options: IdOption[] = items.map((u) => ({ value: u.id, label: u.name }));
  const nameOf = (id: number | null | undefined): string =>
    id == null ? "—" : byId.get(id) ?? `#${id}`;
  return { options, nameOf, isLoading: query.isPending };
}
