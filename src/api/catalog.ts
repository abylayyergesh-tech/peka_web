/** Catalog API: units & products. DTOs mirror app/catalog/schemas.py 1:1. */
import { api } from "@/api/client";
import type { Page, PageParams } from "@/api/client";

export type Dimension = "weight" | "volume" | "count";
export type ProductKind = "ingredient" | "semi_finished" | "dish";
/** Вид номенклатуры — вторая ось к kind: kind про то, КАК товар появляется,
 *  item_type — ЧТО это по сути (еда / упаковка / хозтовары / услуга). */
export type ItemType = "food" | "packaging" | "supplies" | "service";

// ----- units -----
export interface UnitOut {
  unit_id: number;
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

/** Пищевая ценность на 100 г и вес единицы — как в карточке товара iiko.
 *  Заполняется у СЫРЬЯ; у блюд считается по тех-карте. Decimal → строка. */
export interface NutritionFields {
  energy_kcal_100g?: string | null;
  protein_100g?: string | null;
  fat_100g?: string | null;
  carbs_100g?: string | null;
  /** Вес одной базовой единицы в кг (iiko: unitWeight). */
  unit_weight_kg?: string | null;
}

export interface NutrientsOut {
  energy_kcal: string;
  protein: string;
  fat: string;
  carbs: string;
}

export interface NutritionOut {
  product_id: number;
  /** null — неизвестен вес, «на 100 г» не выразить. */
  per_100g: NutrientsOut | null;
  /** На одну базовую единицу продукта. */
  per_unit: NutrientsOut;
  unit_weight_kg: string | null;
  /** "own" — значение заполнено в карточке (в т.ч. выгружено из внешнего меню
   *  iiko), "recipe" — посчитано по тех-карте. */
  source: "own" | "recipe";
  /** false — часть компонентов без КБЖУ, значения занижены. */
  complete: boolean;
  missing_products: number[];
  missing_product_names: string[];
}

/** Расчёт по тех-карте: у сырья — из карточки, у блюда — свёртка состава. */
export async function getProductNutrition(id: number): Promise<NutritionOut> {
  const { data } = await api.get<NutritionOut>(`/products/${id}/nutrition`);
  return data;
}

export interface ProductOut extends NutritionFields {
  item_type: ItemType;
  /** Корневая группа номенклатуры («Сырье», «Хозтовары»). */
  group_name: string | null;
  product_id: number;
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

export interface ProductCreate extends NutritionFields {
  item_type?: ItemType;
  group_name?: string | null;
  name: string;
  kind: ProductKind;
  base_unit_id: number;
  sku?: string | null;
  category?: string | null;
}

export interface ProductUpdate extends NutritionFields {
  item_type?: ItemType;
  group_name?: string | null;
  name?: string;
  sku?: string | null;
  category?: string | null;
  kind?: ProductKind;
  base_unit_id?: number | null;
}

export interface ProductListParams extends PageParams {
  kind?: ProductKind;
  include_inactive?: boolean;
  /** Подстрока в названии или артикуле (регистр не важен). */
  search?: string;
  /** `name|kind|sku|category|created_at`, с «-» — по убыванию. */
  sort?: string;
  /** Фильтр по заполненности КБЖУ — считается на сервере, список постраничный.
   *  `missing` возвращает только ЕДУ: у упаковки и услуг заполнять нечего. */
  nutrition?: "filled" | "missing";
  item_type?: ItemType;
  group?: string;
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

/** Группы номенклатуры организации — наполнение фильтра в каталоге. */
export async function listProductGroups(): Promise<string[]> {
  const { data } = await api.get<string[]>("/product-groups");
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
