/** Пересчёты строки тех-карты: потери, килограммы, проценты. */

/** Сырьё-еда без полного КБЖУ или без веса единицы — карту с ним сохранить нельзя. */
export function foodIngredientNutritionMissing(p?: {
  kind?: string;
  item_type?: string;
  energy_kcal_100g?: string | null;
  protein_100g?: string | null;
  fat_100g?: string | null;
  carbs_100g?: string | null;
  unit_weight_kg?: string | null;
} | null): boolean {
  if (!p || p.kind !== "ingredient") return false;
  if ((p.item_type ?? "food") !== "food") return false;
  return [
    p.energy_kcal_100g,
    p.protein_100g,
    p.fat_100g,
    p.carbs_100g,
    p.unit_weight_kg,
  ].some((v) => v == null || v === "");
}

export function lossPct(base: string | number | null | undefined, after: string | number | null | undefined): number | null {
  const b = Number(base);
  const a = Number(after);
  if (!Number.isFinite(b) || !b) return null;
  if (!Number.isFinite(a)) return null;
  return ((b - a) / b) * 100;
}

export function applyLoss(base: string | number, pct: number | null): string {
  const b = Number(base);
  if (!Number.isFinite(b) || pct == null || !Number.isFinite(pct)) return String(base ?? "");
  const next = b * (1 - pct / 100);
  return next > 0 ? String(Number(next.toFixed(6))) : String(base);
}

/** Вес в кг: для весовых единиц — через factor_to_base (база кг = 1),
 *  для штук — количество × вес единицы товара. */
export function qtyToKg(
  qty: string | number | null | undefined,
  unit: { dimension: string; factor_to_base: string } | undefined,
  unitWeightKg: string | null | undefined,
): number | null {
  const q = Number(qty);
  if (!Number.isFinite(q) || q === 0) return q === 0 ? 0 : null;
  if (unit?.dimension === "weight") {
    return q * Number(unit.factor_to_base);
  }
  const w = Number(unitWeightKg);
  if (!Number.isFinite(w) || w <= 0) return null;
  if (unit?.dimension === "count") {
    const factor = Number(unit.factor_to_base || "1");
    return q * factor * w;
  }
  return null;
}
