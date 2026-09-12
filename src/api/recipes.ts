/** Recipes API. DTOs mirror app/recipes/schemas.py 1:1. */
import { api } from "@/api/client";
import type { Page, PageParams } from "@/api/client";
import type { TechCard } from "@/api/reports";

export type WriteoffMethod = "write_off_ingredients" | "write_off_product";
export type ChangeLogAction =
  | "created"
  | "updated"
  | "versioned"
  | "deactivated"
  | "imported";

export interface RecipeItemIn {
  component_product_id: number;
  quantity: string;
  netto_quantity?: string;
  yield_quantity?: string;
  unit_id: number;
}

export interface RecipeItemOut {
  recipe_item_id: number;
  component_product_id: number;
  quantity: string;
  netto_quantity: string;
  yield_quantity: string;
  unit_id: number;
}

export interface RecipeTechFields {
  writeoff_method?: WriteoffMethod;
  technology_description?: string | null;
  description?: string | null;
  appearance?: string | null;
  organoleptic?: string | null;
  output_comment?: string | null;
  trial_act?: string | null;
  allergens?: string | null;
}

export interface RecipeCreate extends RecipeTechFields {
  product_id: number;
  output_quantity: string;
  output_unit_id: number;
  items: RecipeItemIn[];
  effective_from?: string;
  effective_to?: string | null;
}

export interface RecipeUpdate extends RecipeTechFields {
  output_quantity?: string;
  output_unit_id?: number;
  is_active?: boolean;
  items?: RecipeItemIn[];
  effective_from?: string;
  effective_to?: string | null;
}

export interface RecipeVersionCreate extends RecipeTechFields {
  effective_from: string;
  output_quantity?: string;
  output_unit_id?: number;
  items?: RecipeItemIn[];
  summary?: string;
}

export interface RecipeCalculateIn {
  product_id: number;
  output_quantity: string;
  output_unit_id: number;
  items: RecipeItemIn[];
  menu_id?: number;
  average?: boolean;
}

export interface RecipeOut extends RecipeTechFields {
  recipe_id: number;
  organization_id: number;
  product_id: number;
  product_name: string | null;
  product_sku: string | null;
  output_quantity: string;
  output_unit_id: number;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
  writeoff_method: WriteoffMethod;
  items: RecipeItemOut[];
  created_by: number | null;
  updated_by: number | null;
  changed_by_name: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface RecipeChangeLogOut {
  log_id: number;
  recipe_id: number;
  product_id: number;
  action: ChangeLogAction;
  summary: string;
  diff: Record<string, unknown> | null;
  changed_by: number | null;
  changed_by_name: string | null;
  changed_at: string;
}

export interface RecipeListParams extends PageParams {
  search?: string;
  sort?: string;
  product_id?: number;
  active?: boolean;
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

export async function createRecipeVersion(
  id: number,
  body: RecipeVersionCreate,
): Promise<RecipeOut> {
  const { data } = await api.post<RecipeOut>(`/recipes/${id}/versions`, body);
  return data;
}

export async function listRecipeVersions(productId: number): Promise<RecipeOut[]> {
  const { data } = await api.get<RecipeOut[]>(
    `/products/${productId}/recipe-versions`,
  );
  return data;
}

export async function listRecipeLogs(recipeId: number): Promise<RecipeChangeLogOut[]> {
  const { data } = await api.get<RecipeChangeLogOut[]>(`/recipes/${recipeId}/logs`);
  return data;
}

export async function listProductRecipeLogs(
  productId: number,
): Promise<RecipeChangeLogOut[]> {
  const { data } = await api.get<RecipeChangeLogOut[]>(
    `/products/${productId}/recipe-logs`,
  );
  return data;
}

export async function calculateRecipe(body: RecipeCalculateIn): Promise<TechCard> {
  const { data } = await api.post<TechCard>("/recipes/calculate", body);
  return data;
}
