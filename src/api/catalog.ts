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

  // ---- себестоимость и остаток ----
  // Две ЦЕНЫ, и это не дубль. `avg_cost` — средневзвешенная по остатку, по ней
  // списывают в себестоимость; она существует, только пока остаток положителен.
  // `last_cost_price` — цена последнего прихода, она остаётся и когда сырьё
  // кончилось. Без второй товар без остатка выглядел бы бесплатным.
  /** Средняя за одну базовую единицу; «0» — оценивать нечем. */
  avg_cost: string | null;
  /** Цена последнего прихода за одну базовую единицу. */
  last_cost_price: string | null;
  /** Дата документа, от которой эта цена. */
  last_cost_at: string | null;
  /** Сколько всего лежит на складах, в базовых единицах. */
  stock_quantity: string | null;
  /** Себестоимость ПО ТЕХ-КАРТЕ за одну базовую единицу — для блюд и
   *  полуфабрикатов: своей цены у них нет, они стоят столько, сколько состав. */
  recipe_cost: string | null;
  /** true — у части компонентов цены нет, и `recipe_cost` занижена. */
  recipe_cost_missing: boolean;
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

// ----- product categories -----

/** Справочник категорий товара.
 *
 *  Принадлежность товара к категории живёт в `products.category` (строка) — как в
 *  iiko. Отдельная таблица нужна для двух вещей, которых строкой не добиться:
 *  завести ПУСТУЮ категорию и потом наполнить её, и переименовать категорию
 *  одним движением, а не правкой каждого товара. */
export interface ProductCategoryOut {
  product_category_id: number;
  organization_id: number;
  name: string;
  /** Меньше — выше в списках; при равенстве порядок по имени. */
  sort_order: number;
  note: string | null;
  /** Сколько товаров сейчас в категории — считает сервер. */
  product_count: number;
}

export interface ProductCategoryCreate {
  name: string;
  sort_order?: number;
  note?: string | null;
}

export interface ProductCategoryUpdate {
  name?: string;
  sort_order?: number;
  note?: string | null;
}

export interface ProductsCategoryAssignResult {
  updated: number;
  /** Имя, которое встало у товаров; null — категорию сняли. */
  category: string | null;
}

export async function listProductCategories(): Promise<ProductCategoryOut[]> {
  const { data } = await api.get<ProductCategoryOut[]>("/product-categories");
  return data;
}

export async function createProductCategory(
  body: ProductCategoryCreate,
): Promise<ProductCategoryOut> {
  const { data } = await api.post<ProductCategoryOut>("/product-categories", body);
  return data;
}

/** Переименование тянет за собой товары категории — одной транзакцией. */
export async function updateProductCategory(
  id: number,
  body: ProductCategoryUpdate,
): Promise<ProductCategoryOut> {
  const { data } = await api.patch<ProductCategoryOut>(
    `/product-categories/${id}`,
    body,
  );
  return data;
}

/** Удаляет только категорию: её товары остаются, у них снимается категория. */
export async function deleteProductCategory(id: number): Promise<ProductCategoryOut> {
  const { data } = await api.delete<ProductCategoryOut>(`/product-categories/${id}`);
  return data;
}

/** Перенести товары пачкой. `product_category_id: null` — снять категорию. */
export async function assignProductsCategory(body: {
  product_ids: number[];
  product_category_id: number | null;
}): Promise<ProductsCategoryAssignResult> {
  const { data } = await api.post<ProductsCategoryAssignResult>(
    "/products/category",
    body,
  );
  return data;
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
  /** Категория товара; пустая строка — только товары БЕЗ категории. */
  category?: string;
  /** Дописать себестоимость и остаток. По умолчанию сервер их НЕ считает:
   *  справочники обходят весь каталог постранично, и расчёт по тех-картам
   *  удваивал бы им число запросов. Нужен только списку товаров. */
  with_cost?: boolean;
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
