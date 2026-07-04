/** Catalog API: units & products. DTOs mirror app/catalog/schemas.py 1:1. */
import { api } from "@/api/client";
import type { Page, PageParams } from "@/api/client";

export type Dimension = "weight" | "volume" | "count";
export type ProductKind = "ingredient" | "semi_finished" | "dish";

// ----- units -----
export interface UnitOut {
  id: number;
  organization_id: number;
  name: string;
  dimension: Dimension;
  base_unit_id: number | null;
  /** Decimal (NUMERIC 18,6) serialized as string. */
  factor_to_base: string;
  created_at: string;
  updated_at: string | null;
}

export interface UnitCreate {
  name: string;
  dimension: Dimension;
  base_unit_id?: number | null;
  /** Decimal as string; must be "1" when base_unit_id is null, else > 0. */
  factor_to_base?: string;
}

// ----- products -----
export interface ProductOut {
  id: number;
  organization_id: number;
  name: string;
  sku: string | null;
  category: string | null;
  base_unit_id: number;
  kind: ProductKind;
  is_active: boolean;
  created_by: number | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string | null;
}

export interface ProductCreate {
  name: string;
  kind: ProductKind;
  base_unit_id: number;
  sku?: string | null;
  category?: string | null;
}

export interface ProductUpdate {
  name?: string;
  sku?: string | null;
  category?: string | null;
  kind?: ProductKind;
  base_unit_id?: number | null;
}

export interface ProductListParams extends PageParams {
  kind?: ProductKind;
  include_inactive?: boolean;
}

// ----- unit requests -----
export async function listUnits(params: PageParams): Promise<Page<UnitOut>> {
  const { data } = await api.get<Page<UnitOut>>("/units", { params });
  return data;
}

export async function createUnit(body: UnitCreate): Promise<UnitOut> {
  const { data } = await api.post<UnitOut>("/units", body);
  return data;
}

// ----- product requests -----
export async function listProducts(
  params: ProductListParams,
): Promise<Page<ProductOut>> {
  const { data } = await api.get<Page<ProductOut>>("/products", { params });
  return data;
}

export async function getProduct(id: number): Promise<ProductOut> {
  const { data } = await api.get<ProductOut>(`/products/${id}`);
  return data;
}

export async function createProduct(body: ProductCreate): Promise<ProductOut> {
  const { data } = await api.post<ProductOut>("/products", body);
  return data;
}

export async function updateProduct(
  id: number,
  body: ProductUpdate,
): Promise<ProductOut> {
  const { data } = await api.patch<ProductOut>(`/products/${id}`, body);
  return data;
}

/** Soft-delete: backend deactivates the product and returns it (is_active=false). */
export async function deleteProduct(id: number): Promise<ProductOut> {
  const { data } = await api.delete<ProductOut>(`/products/${id}`);
  return data;
}
