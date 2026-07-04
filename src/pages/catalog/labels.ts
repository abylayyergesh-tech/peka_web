/** RU labels/colours for catalog enums (product kind, unit dimension). */
import type { Dimension, ProductKind } from "@/api/catalog";

export const PRODUCT_KIND_LABELS: Record<ProductKind, string> = {
  ingredient: "Ингредиент",
  semi_finished: "Полуфабрикат",
  dish: "Блюдо",
};

export const PRODUCT_KIND_COLORS: Record<ProductKind, string> = {
  ingredient: "blue",
  semi_finished: "gold",
  dish: "green",
};

export const PRODUCT_KIND_OPTIONS = (
  Object.keys(PRODUCT_KIND_LABELS) as ProductKind[]
).map((k) => ({ value: k, label: PRODUCT_KIND_LABELS[k] }));

export const DIMENSION_LABELS: Record<Dimension, string> = {
  weight: "Масса",
  volume: "Объём",
  count: "Штучно",
};

export const DIMENSION_OPTIONS = (
  Object.keys(DIMENSION_LABELS) as Dimension[]
).map((d) => ({ value: d, label: DIMENSION_LABELS[d] }));
