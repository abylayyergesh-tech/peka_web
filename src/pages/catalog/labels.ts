/** RU labels/colours for catalog enums (product kind, item type, unit dimension). */
import type { Dimension, ItemType, ProductKind } from "@/api/catalog";

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

/** Вид номенклатуры: что это по сути. Отвечает на вопрос, которого не решает
 *  `kind`, — мука, стакан и статья «Аренда» все три «ингредиенты». */
export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  food: "Еда",
  packaging: "Упаковка",
  supplies: "Хозтовары",
  service: "Услуга",
};

export const ITEM_TYPE_COLORS: Record<ItemType, string> = {
  food: "green",
  packaging: "cyan",
  supplies: "default",
  service: "purple",
};

export const ITEM_TYPE_HINTS: Record<ItemType, string> = {
  food: "Сырьё, полуфабрикаты и блюда — участвует в КБЖУ и в меню",
  packaging: "Тара и наклейки: со склада списывается, пищевой ценности нет",
  supplies: "Хозтовары, инвентарь, формы: закупаются, в меню не продаются",
  service: "Статья затрат (ФОТ, аренда, логистика) — на складе ей места нет",
};

export const ITEM_TYPE_OPTIONS = (
  Object.keys(ITEM_TYPE_LABELS) as ItemType[]
).map((t) => ({ value: t, label: ITEM_TYPE_LABELS[t] }));

export const DIMENSION_LABELS: Record<Dimension, string> = {
  weight: "Масса",
  volume: "Объём",
  count: "Штучно",
};

export const DIMENSION_OPTIONS = (
  Object.keys(DIMENSION_LABELS) as Dimension[]
).map((d) => ({ value: d, label: DIMENSION_LABELS[d] }));
