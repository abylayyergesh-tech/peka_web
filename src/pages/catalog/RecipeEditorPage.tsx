import {
  ArrowLeftOutlined,
  CalculatorOutlined,
  EditOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  PrinterOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Result,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  calculateRecipe,
  createRecipeVersion,
  getRecipe,
  listRecipeVersions,
  updateRecipe,
  type RecipeItemIn,
  type RecipeItemOut,
  type RecipeOut,
  type WriteoffMethod,
} from "@/api/recipes";
import { getTechCard, type TechCard, type TechCardCostLine, type TechCardRow } from "@/api/reports";
import { useCan } from "@/auth/store";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import { fmtDate, fmtMoney, fmtQty } from "@/components/format";
import { PRODUCT_KIND_COLORS } from "@/pages/catalog/labels";
import RecipeCostCalculator from "@/pages/catalog/RecipeCostCalculator";
import { applyLoss, foodIngredientNutritionMissing, lossPct, qtyToKg } from "@/pages/catalog/recipeMath";
import {
  useProductOptions,
  useUnitOptions,
} from "@/pages/catalog/useCatalogOptions";

const WRITEOFF_OPTIONS = [
  { value: "write_off_ingredients", label: "Списывать ингредиенты" },
  { value: "write_off_product", label: "Списывать готовое изделие" },
];

interface LineForm {
  component_product_id?: number;
  quantity?: string;
  netto_quantity?: string;
  yield_quantity?: string;
  unit_id?: number;
}

/** Строка таблицы: верхний уровень — редактируемый, вложенный — состав ПФ. */
interface EditorRow extends LineForm {
  key: string;
  no: string;
  lineIndex?: number;
  nested?: boolean;
  sku?: string | null;
  name?: string;
  kind?: string;
  unit_name?: string;
  brutto?: string;
  brutto_kg?: string | null;
  netto_kg?: string | null;
  yield_kg?: string | null;
  cold_loss_pct?: string | null;
  hot_loss_pct?: string | null;
  cost_total?: string | null;
  unit_cost?: string | null;
  cost_per_kg?: string | null;
  nutrition_missing?: boolean;
  energy_kcal_100g?: string | null;
  protein_100g?: string | null;
  fat_100g?: string | null;
  carbs_100g?: string | null;
  children?: EditorRow[];
}

function nestFromCard(rows: TechCardRow[], prefix: string): EditorRow[] {
  return rows.map((row, i) => {
    const no = `${prefix}${i + 1}`;
    return {
      key: `n-${no}`,
      no,
      nested: true,
      component_product_id: row.product_id,
      quantity: row.package_count,
      netto_quantity: row.netto,
      yield_quantity: row.yield_qty,
      sku: row.sku,
      name: row.name,
      kind: row.kind,
      unit_name: row.unit_name,
      brutto: row.brutto,
      brutto_kg: row.brutto_kg,
      netto_kg: row.netto_kg,
      yield_kg: row.yield_kg,
      cold_loss_pct: row.cold_loss_pct,
      hot_loss_pct: row.hot_loss_pct,
      cost_total: row.cost_total,
      unit_cost: row.unit_cost,
      cost_per_kg: row.cost_per_kg,
      nutrition_missing: row.nutrition_missing,
      energy_kcal_100g: row.energy_kcal_100g,
      protein_100g: row.protein_100g,
      fat_100g: row.fat_100g,
      carbs_100g: row.carbs_100g,
      children: row.children.length ? nestFromCard(row.children, `${no}.`) : undefined,
    };
  });
}

function matchCardRow(
  line: LineForm,
  index: number,
  cardRows: TechCardRow[] | undefined,
  taken: Set<number>,
): TechCardRow | undefined {
  if (!cardRows?.length) return undefined;
  if (cardRows[index]?.product_id === line.component_product_id && !taken.has(index)) {
    taken.add(index);
    return cardRows[index];
  }
  const found = cardRows.findIndex(
    (row, i) => row.product_id === line.component_product_id && !taken.has(i),
  );
  if (found < 0) return undefined;
  taken.add(found);
  return cardRows[found];
}

function stopRowToggle(e: { stopPropagation(): void }) {
  e.stopPropagation();
}

interface EditorForm {
  output_quantity: string;
  output_unit_id: number;
  writeoff_method: WriteoffMethod;
  effective_from: string;
  effective_to?: string | null;
  technology_description?: string;
  description?: string;
  appearance?: string;
  organoleptic?: string;
  output_comment?: string;
  trial_act?: string;
  allergens?: string;
  items: LineForm[];
}

function kbjuCell(row: {
  nutrition_missing?: boolean;
  energy_kcal_100g?: string | null;
  protein_100g?: string | null;
  fat_100g?: string | null;
  carbs_100g?: string | null;
}) {
  if (row.nutrition_missing) return <Tag color="error">нет КБЖУ</Tag>;
  if (row.energy_kcal_100g == null) return "—";
  return `${fmtQty(row.energy_kcal_100g)} / ${fmtQty(row.protein_100g ?? null)} / ${fmtQty(row.fat_100g ?? null)} / ${fmtQty(row.carbs_100g ?? null)}`;
}

function formatNutrients(n: { energy_kcal: string; protein: string; fat: string; carbs: string }) {
  return `${fmtQty(n.energy_kcal)} ккал · Б ${fmtQty(n.protein)} · Ж ${fmtQty(n.fat)} · У ${fmtQty(n.carbs)}`;
}

function costOf(row: TechCardRow | undefined, field: "cost_total" | "unit_cost" | "cost_per_kg") {
  if (!row) return null;
  return row[field];
}

function linesFrom(items: RecipeItemOut[]): LineForm[] {
  return items.map((i) => ({
    component_product_id: i.component_product_id,
    quantity: i.quantity,
    netto_quantity: i.netto_quantity,
    yield_quantity: i.yield_quantity,
    unit_id: i.unit_id,
  }));
}

export default function RecipeEditorPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const params = useParams();
  const recipeId = Number(params.id);
  const validId = Number.isFinite(recipeId);
  const canManage = useCan("recipe.manage");
  const products = useProductOptions();
  const units = useUnitOptions();
  const [form] = Form.useForm<EditorForm>();
  const [calcOpen, setCalcOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [versionFrom, setVersionFrom] = useState(dayjs());
  const [versionSummary, setVersionSummary] = useState("");
  const [lines, setLines] = useState<LineForm[] | null>(null);
  const [editing, setEditing] = useState(false);
  const outputQty = Form.useWatch("output_quantity", form);

  const query = useQuery({
    queryKey: ["recipe", recipeId],
    queryFn: () => getRecipe(recipeId),
    enabled: validId,
  });
  const recipe = query.data;
  const editorLines = lines ?? (recipe ? linesFrom(recipe.items) : []);

  const versions = useQuery({
    queryKey: ["recipe-versions", recipe?.product_id],
    queryFn: () => listRecipeVersions(recipe!.product_id),
    enabled: recipe != null,
  });

  const cardQuery = useQuery({
    queryKey: ["tech-card", recipe?.product_id, recipeId],
    queryFn: () => getTechCard(recipe!.product_id, { recipe_id: recipeId }),
    enabled: recipe != null,
    retry: false,
  });

  const [preview, setPreview] = useState<TechCard | null>(null);
  const card = preview ?? cardQuery.data ?? null;

  useEffect(() => {
    setPreview(null);
    setEditing(false);
  }, [recipeId]);

  useEffect(() => {
    if (!recipe) return;
    setLines(linesFrom(recipe.items));
    form.setFieldsValue({
      output_quantity: recipe.output_quantity,
      output_unit_id: recipe.output_unit_id,
      writeoff_method: recipe.writeoff_method,
      effective_from: recipe.effective_from,
      effective_to: recipe.effective_to,
      technology_description: recipe.technology_description ?? "",
      description: recipe.description ?? "",
      appearance: recipe.appearance ?? "",
      organoleptic: recipe.organoleptic ?? "",
      output_comment: recipe.output_comment ?? "",
      trial_act: recipe.trial_act ?? "",
      allergens: recipe.allergens ?? "",
    });
  }, [recipe, form]);

  const costByProduct = useMemo(() => {
    const map = new Map<number, TechCardRow>();
    const walk = (rows: TechCardRow[]) => {
      for (const row of rows) {
        map.set(row.product_id, row);
        if (row.children.length) walk(row.children);
      }
    };
    if (card) walk(card.rows);
    return map;
  }, [card]);

  const missingNutritionNames = useMemo(() => {
    const names = new Set<string>();
    for (const line of editorLines) {
      const p = products.productOf(line.component_product_id);
      if (p && foodIngredientNutritionMissing(p)) names.add(p.name);
    }
    for (const name of card?.nutrition?.missing_product_names ?? []) {
      if (name) names.add(name);
    }
    return [...names];
  }, [editorLines, products, card]);

  function payloadItems(): RecipeItemIn[] {
    return editorLines
      .filter((i) => i.component_product_id && i.unit_id && Number(i.quantity) > 0)
      .map((i) => ({
        component_product_id: i.component_product_id as number,
        quantity: String(i.quantity),
        netto_quantity: i.netto_quantity ? String(i.netto_quantity) : String(i.quantity),
        yield_quantity: i.yield_quantity ? String(i.yield_quantity) : String(i.netto_quantity || i.quantity),
        unit_id: i.unit_id as number,
      }));
  }

  const save = useMutation({
    mutationFn: () => {
      if (missingNutritionNames.length) {
        return Promise.reject(
          new Error(`У сырья не заполнено КБЖУ: ${missingNutritionNames.join(", ")}`),
        );
      }
      const values = form.getFieldsValue();
      return updateRecipe(recipeId, {
        output_quantity: values.output_quantity,
        output_unit_id: values.output_unit_id,
        writeoff_method: values.writeoff_method,
        effective_from: values.effective_from,
        effective_to: values.effective_to || null,
        technology_description: values.technology_description,
        description: values.description,
        appearance: values.appearance,
        organoleptic: values.organoleptic,
        output_comment: values.output_comment,
        trial_act: values.trial_act,
        allergens: values.allergens,
        items: payloadItems(),
      });
    },
    onSuccess: () => {
      message.success("Сохранено");
      setPreview(null);
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["recipe", recipeId] });
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      queryClient.invalidateQueries({ queryKey: ["recipe-versions"] });
      queryClient.invalidateQueries({ queryKey: ["recipe-logs"] });
      queryClient.invalidateQueries({ queryKey: ["tech-card"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const calc = useMutation({
    mutationFn: () => {
      const values = form.getFieldsValue();
      return calculateRecipe({
        product_id: recipe!.product_id,
        output_quantity: values.output_quantity,
        output_unit_id: values.output_unit_id,
        items: payloadItems(),
      });
    },
    onSuccess: (data) => {
      setPreview(data);
      setCalcOpen(true);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const version = useMutation({
    mutationFn: () => {
      if (missingNutritionNames.length) {
        return Promise.reject(
          new Error(`У сырья не заполнено КБЖУ: ${missingNutritionNames.join(", ")}`),
        );
      }
      const values = form.getFieldsValue();
      return createRecipeVersion(recipeId, {
        effective_from: versionFrom.format("YYYY-MM-DD"),
        output_quantity: values.output_quantity,
        output_unit_id: values.output_unit_id,
        writeoff_method: values.writeoff_method,
        technology_description: values.technology_description,
        description: values.description,
        appearance: values.appearance,
        organoleptic: values.organoleptic,
        output_comment: values.output_comment,
        trial_act: values.trial_act,
        allergens: values.allergens,
        items: payloadItems(),
        summary: versionSummary || undefined,
      });
    },
    onSuccess: (created) => {
      message.success("Создана новая версия");
      setVersionOpen(false);
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      queryClient.invalidateQueries({ queryKey: ["recipe-versions"] });
      navigate(`/recipes/${created.recipe_id}`);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const readOnly = !canManage || recipe?.is_active === false || !editing;

  if (!validId) return <Result status="404" title="Тех-карта не найдена" />;
  if (query.isPending) return <Spin style={{ display: "block", marginTop: 48 }} />;
  if (query.isError || !recipe) {
    return (
      <Result
        status="error"
        title="Не удалось загрузить тех-карту"
        subTitle={errorMessage(query.error)}
        extra={<Button onClick={() => navigate("/recipes")}>К списку тех-карт</Button>}
      />
    );
  }

  const totals = card?.totals;
  const pricing = card?.pricing;
  const savedCosts = cardQuery.data?.costs;
  const draftCosts = preview?.costs ?? savedCosts;

  function cancelEdit() {
    setEditing(false);
    setPreview(null);
    setLines(linesFrom(recipe.items));
    form.setFieldsValue({
      output_quantity: recipe.output_quantity,
      output_unit_id: recipe.output_unit_id,
      writeoff_method: recipe.writeoff_method,
      effective_from: recipe.effective_from,
      effective_to: recipe.effective_to,
      technology_description: recipe.technology_description ?? "",
      description: recipe.description ?? "",
      appearance: recipe.appearance ?? "",
      organoleptic: recipe.organoleptic ?? "",
      output_comment: recipe.output_comment ?? "",
      trial_act: recipe.trial_act ?? "",
      allergens: recipe.allergens ?? "",
    });
  }
  const yieldKg = editorLines.reduce((sum: number, line: LineForm) => {
    const p = products.productOf(line.component_product_id);
    const u = units.unitOf(line.unit_id);
    const kg = qtyToKg(line.yield_quantity || line.quantity, u, p?.unit_weight_kg);
    return sum + (kg ?? 0);
  }, 0);

  function setLine(index: number, patch: Partial<LineForm>) {
    setLines((prev) => {
      const next = [...(prev ?? linesFrom(recipe.items))];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  const takenCardRows = new Set<number>();
  const tableRows: EditorRow[] = editorLines.map((line, i) => {
    const no = String(i + 1);
    const product = products.productOf(line.component_product_id);
    const match = matchCardRow(line, i, card?.rows, takenCardRows);
    const nested = match?.children.length
      ? nestFromCard(match.children, `${no}.`)
      : undefined;
    return {
      ...line,
      key: `l-${i}-${line.component_product_id ?? "new"}`,
      no,
      lineIndex: i,
      sku: product?.sku ?? null,
      name: product?.name,
      kind: product?.kind,
      unit_name: units.nameOf(line.unit_id),
      nutrition_missing: match?.nutrition_missing ?? foodIngredientNutritionMissing(product),
      energy_kcal_100g: match?.energy_kcal_100g ?? product?.energy_kcal_100g,
      protein_100g: match?.protein_100g ?? product?.protein_100g,
      fat_100g: match?.fat_100g ?? product?.fat_100g,
      carbs_100g: match?.carbs_100g ?? product?.carbs_100g,
      children: nested,
    };
  });

  async function openNestedRecipe(productId: number) {
    try {
      const versions = await listRecipeVersions(productId);
      const active = versions.find((v) => v.is_active) ?? versions[0];
      if (active) navigate(`/recipes/${active.recipe_id}`);
      else message.info("У этого полуфабриката нет тех-карты");
    } catch (e) {
      message.error(errorMessage(e));
    }
  }

  const lineColumns: ColumnsType<EditorRow> = [
    { title: "№", dataIndex: "no", width: 56 },
    {
      title: "Артикул",
      width: 88,
      render: (_, row) =>
        row.sku ?? products.productOf(row.component_product_id)?.sku ?? "—",
    },
    {
      title: "Наименование продукта",
      width: 260,
      render: (_, row) => {
        const isPf = row.kind === "semi_finished" || !!row.children;
        const pfTag = isPf ? (
          <Tag
            color={PRODUCT_KIND_COLORS.semi_finished}
            style={{ marginInlineEnd: 0, cursor: row.component_product_id ? "pointer" : undefined }}
            onClick={(e) => {
              stopRowToggle(e);
              if (row.component_product_id) void openNestedRecipe(row.component_product_id);
            }}
          >
            ПФ
          </Tag>
        ) : null;
        if (row.nested) {
          return (
            <Space size={6} wrap>
              <span>{row.name ?? "—"}</span>
              {pfTag}
            </Space>
          );
        }
        return (
          <Space size={6} style={{ width: "100%" }} onClick={stopRowToggle}>
            <Select
              showSearch
              optionFilterProp="label"
              disabled={readOnly}
              loading={products.isLoading}
              options={products.options}
              value={row.component_product_id}
              style={{ flex: 1, minWidth: 160 }}
              onChange={(id) => {
                const p = products.productOf(id);
                setLine(row.lineIndex as number, {
                  component_product_id: id,
                  unit_id: p?.base_unit_id ?? row.unit_id,
                });
              }}
            />
            {pfTag}
          </Space>
        );
      },
    },
    {
      title: "КБЖУ / 100 г",
      width: 150,
      render: (_, row) => kbjuCell(row),
    },
    {
      title: "Ед. изм.",
      width: 100,
      render: (_, row) =>
        row.nested ? (
          row.unit_name ?? "—"
        ) : (
          <Select
            showSearch
            optionFilterProp="label"
            disabled={readOnly}
            loading={units.isLoading}
            options={units.options}
            value={row.unit_id}
            style={{ width: "100%" }}
            onClick={stopRowToggle}
            onChange={(id) => setLine(row.lineIndex as number, { unit_id: id })}
          />
        ),
    },
    {
      title: "Кол-во в фасовке",
      width: 110,
      align: "right",
      render: (_, row) => fmtQty(row.quantity ?? null),
    },
    {
      title: "Брутто, ед. изм.",
      width: 120,
      render: (_, row) =>
        row.nested ? (
          fmtQty(row.brutto ?? row.quantity ?? null)
        ) : (
          <InputNumber
            stringMode
            min="0"
            disabled={readOnly}
            value={row.quantity}
            style={{ width: "100%" }}
            onClick={stopRowToggle}
            onChange={(v) => {
              const qty = v == null ? "" : String(v);
              const sameNetto = !row.netto_quantity || row.netto_quantity === row.quantity;
              const sameYield =
                !row.yield_quantity ||
                row.yield_quantity === row.netto_quantity ||
                row.yield_quantity === row.quantity;
              setLine(row.lineIndex as number, {
                quantity: qty,
                netto_quantity: sameNetto ? qty : row.netto_quantity,
                yield_quantity: sameYield
                  ? sameNetto
                    ? qty
                    : row.netto_quantity
                  : row.yield_quantity,
              });
            }}
          />
        ),
    },
    {
      title: "Брутто, кг",
      width: 96,
      align: "right",
      render: (_, row) => {
        if (row.nested) return row.brutto_kg == null ? "—" : fmtQty(row.brutto_kg);
        const p = products.productOf(row.component_product_id);
        const kg = qtyToKg(row.quantity, units.unitOf(row.unit_id), p?.unit_weight_kg);
        return kg == null ? "—" : fmtQty(kg);
      },
    },
    {
      title: "% хол. обр.",
      width: 96,
      render: (_, row) =>
        row.nested ? (
          <span>{fmtQty(row.cold_loss_pct ?? "0")}</span>
        ) : (
          <InputNumber
            disabled={readOnly}
            value={lossPct(row.quantity, row.netto_quantity) ?? 0}
            style={{ width: "100%" }}
            onClick={stopRowToggle}
            onChange={(pct) => {
              const netto = applyLoss(row.quantity ?? "0", pct);
              const sameYield = !row.yield_quantity || row.yield_quantity === row.netto_quantity;
              setLine(row.lineIndex as number, {
                netto_quantity: netto,
                yield_quantity: sameYield ? netto : row.yield_quantity,
              });
            }}
          />
        ),
    },
    {
      title: "Нетто, кг",
      width: 96,
      align: "right",
      render: (_, row) => {
        if (row.nested) return row.netto_kg == null ? "—" : fmtQty(row.netto_kg);
        const p = products.productOf(row.component_product_id);
        const kg = qtyToKg(row.netto_quantity || row.quantity, units.unitOf(row.unit_id), p?.unit_weight_kg);
        return kg == null ? "—" : fmtQty(kg);
      },
    },
    {
      title: "% гор. обр.",
      width: 96,
      render: (_, row) =>
        row.nested ? (
          <span>{fmtQty(row.hot_loss_pct ?? "0")}</span>
        ) : (
          <InputNumber
            disabled={readOnly}
            value={lossPct(row.netto_quantity || row.quantity, row.yield_quantity) ?? 0}
            style={{ width: "100%" }}
            onClick={stopRowToggle}
            onChange={(pct) =>
              setLine(row.lineIndex as number, {
                yield_quantity: applyLoss(row.netto_quantity || row.quantity || "0", pct),
              })
            }
          />
        ),
    },
    {
      title: "Выход, кг",
      width: 96,
      align: "right",
      render: (_, row) => {
        if (row.nested) return row.yield_kg == null ? "—" : fmtQty(row.yield_kg);
        const p = products.productOf(row.component_product_id);
        const kg = qtyToKg(
          row.yield_quantity || row.netto_quantity || row.quantity,
          units.unitOf(row.unit_id),
          p?.unit_weight_kg,
        );
        return kg == null ? "—" : fmtQty(kg);
      },
    },
    {
      title: "Себестоимость",
      width: 120,
      align: "right",
      render: (_, row) => {
        const c = row.nested
          ? row.cost_total
          : costOf(costByProduct.get(row.component_product_id as number), "cost_total");
        return c == null ? "—" : fmtMoney(c);
      },
    },
    {
      title: "Стоимость за ед.",
      width: 120,
      align: "right",
      render: (_, row) => {
        const c = row.nested
          ? row.unit_cost
          : costOf(costByProduct.get(row.component_product_id as number), "unit_cost");
        return c == null ? "—" : fmtMoney(c);
      },
    },
    {
      title: "Стоимость за ед. веса",
      width: 130,
      align: "right",
      render: (_, row) => {
        const c = row.nested
          ? row.cost_per_kg
          : costOf(costByProduct.get(row.component_product_id as number), "cost_per_kg");
        return c == null ? "—" : fmtMoney(c);
      },
    },
    {
      title: "",
      width: 48,
      render: (_, row) =>
        !row.nested && !readOnly && editorLines.length > 1 ? (
          <Button
            type="link"
            danger
            onClick={(e) => {
              stopRowToggle(e);
              setLines((prev) =>
                (prev ?? linesFrom(recipe.items)).filter((_, idx) => idx !== row.lineIndex),
              );
            }}
          >
            ×
          </Button>
        ) : null,
    },
  ];

  const historyColumns: ColumnsType<RecipeOut> = [
    {
      title: "Начало действия",
      dataIndex: "effective_from",
      width: 150,
      render: (v: string) => fmtDate(v),
    },
    {
      title: "Конец действия",
      dataIndex: "effective_to",
      width: 150,
      render: (v: string | null) => (v ? fmtDate(v) : "—"),
    },
    {
      title: "Изменил",
      dataIndex: "changed_by_name",
      render: (v: string | null) => v || "—",
    },
    {
      title: "",
      width: 160,
      render: (_, row) => (
        <Space>
          {row.recipe_id === recipeId && <Tag color="blue">эта версия</Tag>}
          {row.is_active ? <Tag color="green">действует</Tag> : <Tag>архив</Tag>}
        </Space>
      ),
    },
  ];

  const footer = (
    <div className="no-print" style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
      <Space>
        <Button icon={<PrinterOutlined />} onClick={() => window.print()}>
          Печать
        </Button>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => {
            setPreview(null);
            query.refetch();
            cardQuery.refetch();
          }}
        >
          Обновить
        </Button>
      </Space>
      <Space>
        {editing ? (
          <>
            <Button onClick={cancelEdit}>Отменить</Button>
            <Button
              onClick={() => save.mutate()}
              loading={save.isPending}
              disabled={missingNutritionNames.length > 0}
            >
              Сохранить
            </Button>
            <Button
              type="primary"
              onClick={() =>
                save.mutate(undefined, { onSuccess: () => navigate("/recipes") })
              }
              loading={save.isPending}
              disabled={missingNutritionNames.length > 0}
            >
              Сохранить и закрыть
            </Button>
          </>
        ) : (
          <Button onClick={() => navigate("/recipes")}>К списку</Button>
        )}
      </Space>
    </div>
  );

  return (
    <div className="tech-card-page">
      <style>{`
        .tech-card-nested td { background: #fafafa; }
        @media print {
          .no-print, .ant-layout-sider, .ant-layout-header { display: none !important; }
          .tech-card-page { padding: 0; }
        }
      `}</style>
      <Space style={{ marginBottom: 12 }} className="no-print" wrap>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/recipes")}>
          Назад
        </Button>
        <h2 style={{ margin: 0 }}>
          {recipe.product_name ?? products.nameOf(recipe.product_id)}
          {recipe.product_sku ? ` · арт. ${recipe.product_sku}` : ""}
        </h2>
        {recipe.is_active ? <Tag color="green">Действует</Tag> : <Tag>Архивная версия</Tag>}
        {editing ? <Tag color="blue">Редактирование</Tag> : null}
        {canManage && recipe.is_active && !editing && (
          <Button type="primary" icon={<EditOutlined />} onClick={() => setEditing(true)}>
            Редактировать
          </Button>
        )}
        {editing && (
          <Button onClick={cancelEdit}>Отменить</Button>
        )}
      </Space>

      <Form
        key={recipe.recipe_id}
        form={form}
        layout="vertical"
        disabled={readOnly}
        initialValues={{
          output_quantity: recipe.output_quantity,
          output_unit_id: recipe.output_unit_id,
          writeoff_method: recipe.writeoff_method,
          effective_from: recipe.effective_from,
          effective_to: recipe.effective_to,
          technology_description: recipe.technology_description ?? "",
          description: recipe.description ?? "",
          appearance: recipe.appearance ?? "",
          organoleptic: recipe.organoleptic ?? "",
          output_comment: recipe.output_comment ?? "",
          trial_act: recipe.trial_act ?? "",
          allergens: recipe.allergens ?? "",
        }}
      >
        <Tabs
          items={[
            {
              key: "card",
              label: "Технологическая карта",
              children: (
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                  <div className="no-print" style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <Space>
                      {editing && (
                        <Button
                          icon={<PlusOutlined />}
                          onClick={() => setVersionOpen(true)}
                          disabled={missingNutritionNames.length > 0}
                        >
                          Новая версия
                        </Button>
                      )}
                    </Space>
                    <Button
                      type="primary"
                      icon={<CalculatorOutlined />}
                      loading={calc.isPending}
                      onClick={() => calc.mutate()}
                      disabled={editorLines.length === 0}
                    >
                      Просчёт себестоимости
                    </Button>
                  </div>

                  <Table<EditorRow>
                    size="small"
                    pagination={false}
                    rowKey="key"
                    dataSource={tableRows}
                    columns={lineColumns}
                    scroll={{ x: 1920 }}
                    rowClassName={(row) => (row.nested ? "tech-card-nested" : "")}
                    expandable={{
                      childrenColumnName: "children",
                      rowExpandable: (row) => !!row.children?.length,
                      expandRowByClick: true,
                      indentSize: 18,
                    }}
                    locale={{ emptyText: "Нет данных" }}
                    summary={() => (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} />
                        <Table.Summary.Cell index={1} colSpan={7}>
                          <b>Итого</b>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={8} align="right">
                          <b>{fmtQty(totals?.brutto_kg ?? null)}</b>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={9} />
                        <Table.Summary.Cell index={10} align="right">
                          <b>{fmtQty(totals?.netto_kg ?? null)}</b>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={11} />
                        <Table.Summary.Cell index={12} align="right">
                          <b>{fmtQty(totals?.yield_kg ?? null)}</b>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={13} align="right">
                          <b>{fmtMoney(totals?.cost ?? null)}</b>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={14} colSpan={3} />
                      </Table.Summary.Row>
                    )}
                  />
                  {missingNutritionNames.length > 0 && (
                    <Alert
                      className="no-print"
                      type="error"
                      showIcon
                      message="У сырья не заполнено КБЖУ"
                      description={`${missingNutritionNames.join(", ")}. Заполните калории, белки, жиры, углеводы и вес единицы в карточке товара — иначе тех-карту сохранить нельзя.`}
                    />
                  )}
                  <div className="no-print" style={{ color: "#8c8c8c", fontSize: 12 }}>
                    Полуфабрикат с тех-картой помечен «ПФ»: стрелка или клик по строке
                    раскрывает его состав. Клик по метке открывает тех-карту ПФ.
                  </div>
                  {!readOnly && (
                    <Button
                      className="no-print"
                      type="dashed"
                      icon={<PlusOutlined />}
                      onClick={() =>
                        setLines((prev) => [
                          ...(prev ?? linesFrom(recipe.items)),
                          { quantity: "1", netto_quantity: "1", yield_quantity: "1" },
                        ])
                      }
                    >
                      Добавить ингредиент
                    </Button>
                  )}

                  <div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-start" }}>
                    <Space direction="vertical" size={8}>
                      <Form.Item name="output_quantity" label="Норма закладки" style={{ marginBottom: 0 }}>
                        <InputNumber stringMode min="0" style={{ width: 160 }} />
                      </Form.Item>
                      <Form.Item name="output_unit_id" label="Единица нормы" style={{ marginBottom: 0 }}>
                        <Select options={units.options} showSearch optionFilterProp="label" style={{ width: 200 }} />
                      </Form.Item>
                      <div>
                        <div style={{ color: "#8c8c8c", fontSize: 12 }}>Суммарный выход</div>
                        <div style={{ fontWeight: 600 }}>
                          {fmtQty(totals?.yield_kg ?? (yieldKg || null))} кг
                          {outputQty ? ` · на ${fmtQty(outputQty)} ${units.nameOf(recipe.output_unit_id)}` : ""}
                        </div>
                      </div>
                      <Form.Item name="writeoff_method" label="Метод списания" style={{ marginBottom: 0 }}>
                        <Select options={WRITEOFF_OPTIONS} style={{ width: 260 }} />
                      </Form.Item>
                    </Space>
                    <CostBox
                      salePrice={pricing?.sale_price ?? null}
                      sss={savedCosts?.sss}
                      spp={savedCosts?.spp}
                      ssn={savedCosts?.ssn}
                      ssnPrime={draftCosts?.ssn}
                      ssnpp={(preview ?? cardQuery.data)?.costs?.ssnpp}
                    />
                  </div>
                  {card?.nutrition && (
                    <Card size="small" title="Пищевая ценность">
                      <Space size={32} wrap>
                        <Metric
                          label="На 100 г"
                          value={
                            card.nutrition.per_100g
                              ? formatNutrients(card.nutrition.per_100g)
                              : "неизвестен вес"
                          }
                        />
                        <Metric
                          label={`На ${fmtQty(card.output_quantity)} ${card.output_unit_name}`}
                          value={formatNutrients(card.nutrition.per_unit)}
                        />
                      </Space>
                      {!card.nutrition.complete && card.nutrition.missing_product_names.length > 0 && (
                        <Alert
                          type="warning"
                          showIcon
                          style={{ marginTop: 8 }}
                          message="КБЖУ неполное"
                          description={`Без КБЖУ: ${card.nutrition.missing_product_names.join(", ")}`}
                        />
                      )}
                    </Card>
                  )}

                  <Card size="small" title="История технологических карт">
                    <Table<RecipeOut>
                      rowKey="recipe_id"
                      size="small"
                      pagination={false}
                      loading={versions.isPending}
                      dataSource={versions.data}
                      columns={historyColumns}
                      rowClassName={(row) =>
                        row.recipe_id === recipeId ? "" : "row-clickable"
                      }
                      onRow={(row) => ({
                        onClick: () => {
                          if (row.recipe_id !== recipeId) {
                            navigate(`/recipes/${row.recipe_id}`);
                          }
                        },
                      })}
                    />
                  </Card>
                </Space>
              ),
            },
            {
              key: "trial",
              label: "Акт проработки",
              children: (
                <Form.Item name="trial_act" label="Акт проработки">
                  <Input.TextArea rows={14} placeholder="Замечания по отработке рецепта, контрольные проработки, кто утвердил" />
                </Form.Item>
              ),
            },
            {
              key: "tech",
              label: "Технология",
              children: (
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                  <Form.Item name="technology_description" label="Описание готовки">
                    <Input.TextArea rows={8} placeholder="Пошаговая технология приготовления" />
                  </Form.Item>
                  <Form.Item name="description" label="Описание блюда">
                    <Input.TextArea rows={4} />
                  </Form.Item>
                  <Form.Item name="appearance" label="Внешний вид">
                    <Input.TextArea rows={3} />
                  </Form.Item>
                  <Form.Item name="organoleptic" label="Органолептика">
                    <Input.TextArea rows={3} />
                  </Form.Item>
                  <Form.Item name="output_comment" label="Комментарий к выходу">
                    <Input.TextArea rows={2} />
                  </Form.Item>
                </Space>
              ),
            },
            {
              key: "allergens",
              label: "Аллергены",
              children: (
                <Form.Item name="allergens" label="Аллергены">
                  <Input.TextArea rows={8} placeholder="Перечень аллергенов, которые содержит блюдо" />
                </Form.Item>
              ),
            },
            {
              key: "files",
              label: "Файлы",
              children: (
                <Space direction="vertical" size={16} style={{ width: "100%" }}>
                  <AttachmentsPanel
                    owner={{ kind: "recipe", recipeId }}
                    canManage={canManage && editing}
                    emptyText="У этой версии ещё нет файлов"
                    uploadHint="Перетащите скан акта, фото или PDF тех-карты"
                  />
                  {(versions.data ?? []).filter((v) => v.recipe_id !== recipeId).length > 0 && (
                    <Card size="small" title="Файлы других версий">
                      {(versions.data ?? [])
                        .filter((v) => v.recipe_id !== recipeId)
                        .map((v) => (
                          <div key={v.recipe_id} style={{ marginBottom: 16 }}>
                            <a onClick={() => navigate(`/recipes/${v.recipe_id}`)}>
                              {fmtDate(v.effective_from)}
                              {v.effective_to ? ` — ${fmtDate(v.effective_to)}` : " — н.в."}
                            </a>
                            <div style={{ marginTop: 8 }}>
                              <AttachmentsPanel
                                owner={{ kind: "recipe", recipeId: v.recipe_id }}
                                canManage={false}
                                emptyText="Файлов нет"
                              />
                            </div>
                          </div>
                        ))}
                    </Card>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </Form>

      {footer}

      <RecipeCostCalculator open={calcOpen} card={card} onClose={() => setCalcOpen(false)} />

      <Modal
        title="Новая версия тех-карты"
        open={versionOpen}
        onCancel={() => setVersionOpen(false)}
        onOk={() => version.mutate()}
        confirmLoading={version.isPending}
        okText="Создать версию"
      >
        <Space direction="vertical" style={{ width: "100%" }} size={12}>
          <div>
            Текущая карта закроется днём раньше выбранной даты. Состав и тексты
            скопируются из того, что сейчас на экране.
          </div>
          <div>
            <div style={{ marginBottom: 4 }}>Начало действия</div>
            <DatePicker
              value={versionFrom}
              onChange={(d) => d && setVersionFrom(d)}
              format="DD.MM.YYYY"
              style={{ width: "100%" }}
            />
          </div>
          <Input.TextArea
            rows={3}
            placeholder="Что изменилось в этой версии"
            value={versionSummary}
            onChange={(e) => setVersionSummary(e.target.value)}
          />
        </Space>
      </Modal>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: "#8c8c8c", fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function formatCostLine(line?: TechCardCostLine | null): string {
  if (line?.amount == null) return "";
  const money = fmtMoney(line.amount);
  if (line.food_cost_pct == null || line.markup_pct == null) return money;
  return `${money}  ${fmtQty(line.food_cost_pct)}%(${fmtQty(line.markup_pct)}%)`;
}

function CostHint({ title, text }: { title: string; text: string }) {
  return (
    <Tooltip title={text}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
        {title}
        <InfoCircleOutlined style={{ color: "#1677ff", fontSize: 13 }} />
      </span>
    </Tooltip>
  );
}

function CostBox({
  salePrice,
  sss,
  spp,
  ssn,
  ssnPrime,
  ssnpp,
}: {
  salePrice: string | null;
  sss?: TechCardCostLine | null;
  spp?: TechCardCostLine | null;
  ssn?: TechCardCostLine | null;
  ssnPrime?: TechCardCostLine | null;
  ssnpp?: TechCardCostLine | null;
}) {
  const changed = ssnPrime?.amount != null && ssn?.amount != null && ssnPrime.amount !== ssn.amount;
  return (
    <div
      style={{
        flex: 1,
        minWidth: 420,
        border: "1px solid #d9d9d9",
        background: "#fafafa",
        padding: "10px 14px 12px",
      }}
    >
      <div style={{ marginBottom: 10 }}>
        <b>Розничная цена:</b> {fmtMoney(salePrice)}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          columnGap: 32,
          rowGap: 8,
          alignItems: "center",
        }}
      >
        <CostRow
          label={<CostHint title="ССС" text="Скользящая средняя себестоимость изделия на складе" />}
          value={sss?.amount == null ? "" : fmtMoney(sss.amount)}
          empty
        />
        <CostRow
          label={<CostHint title="ССН" text="Себестоимость сырьевого набора по средней склада" />}
          value={formatCostLine(ssn)}
        />
        <CostRow
          label={<CostHint title="СПП" text="Себестоимость изделия по последнему приходу" />}
          value={spp?.amount == null ? "" : fmtMoney(spp.amount)}
          empty
        />
        <CostRow
          label={
            <span style={{ color: "#1677ff" }}>
              <CostHint
                title="ССН'"
                text="Себестоимость сырьевого набора с учётом изменений на экране"
              />
            </span>
          }
          value={formatCostLine(ssnPrime ?? ssn)}
          accent={changed}
        />
        <div />
        <CostRow
          label={
            <CostHint title="ССНПП" text="Себестоимость сырьевого набора по последнему приходу" />
          }
          value={formatCostLine(ssnpp)}
        />
      </div>
    </div>
  );
}

function CostRow({
  label,
  value,
  empty,
  accent,
}: {
  label: ReactNode;
  value: string;
  empty?: boolean;
  accent?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 28 }}>
      <div style={{ width: 72, color: accent ? "#1677ff" : undefined }}>{label}</div>
      <div
        style={{
          flex: 1,
          minHeight: 24,
          padding: "2px 8px",
          background: empty && !value ? "#fff" : undefined,
          border: empty ? "1px solid #d9d9d9" : undefined,
          fontWeight: 600,
        }}
      >
        {value || (empty ? <span style={{ color: "#bfbfbf" }}>&nbsp;</span> : "—")}
      </div>
    </div>
  );
}
