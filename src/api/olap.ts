/** Конструктор OLAP-отчётов (бэкенд: app/reports/olap.py). */
import { api } from "@/api/client";

export type OlapCubeKey = "sales" | "stock";

export interface OlapField {
  key: string;
  label: string;
  type: string;
  filterable: boolean;
  hint: string | null;
}

export interface OlapCube {
  key: OlapCubeKey;
  label: string;
  description: string;
  dimensions: OlapField[];
  measures: OlapField[];
}

export interface OlapFilter {
  field: string;
  op: "in" | "not_in" | "contains";
  values: (string | number | boolean)[];
}

export interface OlapQuery {
  cube: OlapCubeKey;
  date_from: string;
  date_to: string;
  dimensions: string[];
  measures: string[];
  filters: OlapFilter[];
  sort: { field: string; dir: "asc" | "desc" }[];
  limit: number;
}

export interface OlapColumn {
  key: string;
  label: string;
  kind: "dimension" | "measure";
  type: string;
}

export interface OlapResult {
  columns: OlapColumn[];
  rows: Record<string, string | number | boolean | null>[];
  totals: Record<string, string | number | null>;
  truncated: boolean;
  row_count: number;
  sql: string | null;
}

export async function getOlapMeta(): Promise<OlapCube[]> {
  const { data } = await api.get<OlapCube[]>("/reports/olap/meta");
  return data;
}

export async function runOlapQuery(body: OlapQuery): Promise<OlapResult> {
  const { data } = await api.post<OlapResult>("/reports/olap/query", body);
  return data;
}

export async function getOlapValues(params: {
  cube: OlapCubeKey;
  dimension: string;
  from: string;
  to: string;
  q?: string;
}): Promise<{ value: string | number | boolean; label: string }[]> {
  const { data } = await api.get("/reports/olap/values", { params });
  return data;
}
