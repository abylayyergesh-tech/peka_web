/** Recipes API. DTOs mirror app/recipes/schemas.py 1:1. */
import { api } from "@/api/client";
import type { Page, PageParams } from "@/api/client";

export interface RecipeItemIn {
  component_product_id: number;
  /** Decimal as string; must be > 0. */
  quantity: string;
  unit_id: number;
}

export interface RecipeItemOut {
  recipe_item_id: number;
  component_product_id: number;
  quantity: string;
  unit_id: number;
}

export interface RecipeCreate {
  product_id: number;
  output_quantity: string;
  output_unit_id: number;
  /** At least one item is required. */
  items: RecipeItemIn[];
}

export interface RecipeUpdate {
  output_quantity?: string;
  output_unit_id?: number;
  is_active?: boolean;
  /** When provided, replaces the full item set (min 1). */
  items?: RecipeItemIn[];
}

export interface RecipeOut {
  recipe_id: number;
  organization_id: number;
  product_id: number;
  output_quantity: string;
  output_unit_id: number;
  is_active: boolean;
  items: RecipeItemOut[];
  created_at: string;
  updated_at: string | null;
}

export interface RecipeListParams extends PageParams {
  /** Подстрока в названии ИЗДЕЛИЯ: у тех-карты своего имени нет. */
  search?: string;
  /** `product|output_quantity|created_at`, с «-» — по убыванию. */
  sort?: string;
}

export async function listRecipes(params: RecipeListParams): Promise<Page<RecipeOut>> {
  const { data } = await api.get<Page<RecipeOut>>("/recipes", { params });
  return data;
}

export async function getRecipe(id: number): Promise<RecipeOut> {
  const { data } = await api.get<RecipeOut>(`/recipes/${id}`);
  return data;
}

export async function createRecipe(body: RecipeCreate): Promise<RecipeOut> {
  const { data } = await api.post<RecipeOut>("/recipes", body);
  return data;
}

export async function updateRecipe(
  id: number,
  body: RecipeUpdate,
): Promise<RecipeOut> {
  const { data } = await api.put<RecipeOut>(`/recipes/${id}`, body);
  return data;
}

export async function deleteRecipe(id: number): Promise<void> {
  await api.delete(`/recipes/${id}`);
}
