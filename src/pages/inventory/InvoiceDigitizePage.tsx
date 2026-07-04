/** Оцифровка накладной: загрузка фото/PDF → (поворот, если снято боком) →
 *  распознавание (Gemini) → предпросмотр с подсвеченными зонами + редактируемая
 *  форма → черновик прихода через обычный POST /documents.
 *
 *  Поворот выполняется честно (canvas → новый файл), а не CSS-трансформацией:
 *  до распознавания в Gemini уходит уже выправленное изображение (это заметно
 *  улучшает качество), после — зоны box_2d поворачиваются той же математикой,
 *  что и картинка, и остаются приклеенными к строкам. */
import {
  CheckCircleOutlined,
  FileTextOutlined,
  InboxOutlined,
  MinusCircleOutlined,
  PlusOutlined,
  RotateLeftOutlined,
  RotateRightOutlined,
  ScanOutlined,
  ZoomInOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Steps,
  Switch,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import { createProduct, listUnits, type ProductKind } from "@/api/catalog";
import {
  digitizeInvoice,
  saveDigitizeAliases,
  type Box2D,
  type DigitizedInvoiceOut,
  type MatchSource,
} from "@/api/digitize";
import {
  createDocument,
  listProducts,
  listSuppliers,
  listWarehouses,
  type ReceiptDocumentCreate,
  type ReceiptLineIn,
} from "@/api/inventory";
import { createSupplier } from "@/api/procurement";
import { fmtMoney } from "@/components/format";

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

/** Насколько уверенно строка привязана к каталогу — цвет зоны и карточки.
 *  "ai" — семантический выбор Gemini: id валиден, но человеку стоит взглянуть. */
type MatchGrade = "good" | "weak" | "ai" | "none";

const GRADE_COLOR: Record<MatchGrade, string> = {
  good: "#52c41a",
  weak: "#fa8c16",
  ai: "#722ed1",
  none: "#ff4d4f",
};

/** Постоянные атрибуты строки из распознавания (не редактируются в форме). */
interface LineMeta {
  raw_name: string | null;
  score: number | null;
  box: Box2D | null;
  source: MatchSource | null;
  discount_percent: string | null;
  discount_amount: string | null;
}

const EMPTY_META: LineMeta = {
  raw_name: null,
  score: null,
  box: null,
  source: null,
  discount_percent: null,
  discount_amount: null,
};

/** Разложение суммы строки на «с НДС / без НДС / НДС» при ставке rate (%).
 *  included=true — цены в накладной уже включают НДС (обычная практика РК). */
function vatBreakdown(
  qty: string | undefined,
  price: string | undefined,
  rate: string | undefined,
  included: boolean,
): { withVat: number; net: number; vat: number; rate: number } | null {
  const q = Number(qty);
  const p = Number(price);
  const r = Number(rate ?? "0");
  if (!Number.isFinite(q) || !Number.isFinite(p) || q <= 0 || p <= 0) return null;
  const total = q * p;
  if (!Number.isFinite(r) || r <= 0) return { withVat: total, net: total, vat: 0, rate: 0 };
  if (included) {
    const net = total / (1 + r / 100);
    return { withVat: total, net, vat: total - net, rate: r };
  }
  const vat = (total * r) / 100;
  return { withVat: total + vat, net: total, vat, rate: r };
}

function gradeOf(productId: number | undefined, meta: LineMeta | undefined): MatchGrade {
  if (productId == null) return "none";
  if (meta?.source === "alias") return "good";
  if (meta?.source === "ai") return "ai";
  return (meta?.score ?? 0) >= 0.8 ? "good" : "weak";
}

interface LineFormValue {
  product_id?: number;
  quantity?: string;
  unit_id?: number;
  price?: string;
  /** Ставка НДС для отображения сумм (в БД V1 не сохраняется). */
  vat_rate?: string;
}

interface DigitizeFormValues {
  doc_date: Dayjs;
  internal?: boolean;
  supplier_id?: number;
  warehouse_id: number;
  counterparty?: string;
  lines: LineFormValue[];
}

type RotateDir = 1 | -1; // 1 = по часовой, -1 = против

/** Единый стиль секций: заметная рамка + серая шапка, чтобы блоки страницы
 *  читались как отдельные карточки, а не сливались в простыню. */
const SECTION_STYLE: React.CSSProperties = {
  border: "1px solid #d9d9d9",
  borderRadius: 10,
  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
};
const SECTION_HEAD: React.CSSProperties = {
  background: "#fafafa",
  borderBottom: "1px solid #e5e5e5",
};

/** Проверка контрольного разряда БИН/ИИН РК (зеркалит бэкенд-валидацию). */
function isValidIinBin(taxId: string): boolean {
  if (!/^\d{12}$/.test(taxId)) return false;
  const d = taxId.split("").map(Number);
  const w1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const w2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2];
  let control = d.slice(0, 11).reduce((s, v, i) => s + v * w1[i], 0) % 11;
  if (control === 10) {
    control = d.slice(0, 11).reduce((s, v, i) => s + v * w2[i], 0) % 11;
    if (control === 10) return false;
  }
  return control === d[11];
}

const digitsOnly = (s: string) => s.replace(/\D/g, "");

function boxStyle(box: Box2D): React.CSSProperties {
  const [ymin, xmin, ymax, xmax] = box;
  return {
    position: "absolute",
    top: `${ymin / 10}%`,
    left: `${xmin / 10}%`,
    height: `${(ymax - ymin) / 10}%`,
    width: `${(xmax - xmin) / 10}%`,
  };
}

/** Поворот box_2d [ymin,xmin,ymax,xmax] (нормировка 0–1000) на 90°.
 *  По часовой: (x,y) → (1000−y, x); против: (x,y) → (y, 1000−x). */
function rotateBox(box: Box2D, dir: RotateDir): Box2D {
  const [ymin, xmin, ymax, xmax] = box;
  return dir === 1
    ? [xmin, 1000 - ymax, xmax, 1000 - ymin]
    : [1000 - xmax, ymin, 1000 - xmin, ymax];
}

/** Физический поворот изображения на 90° — новый File через canvas.
 *  createImageBitmap применяет EXIF-ориентацию, так что телефонные фото
 *  выправляются, а в Gemini уходит ровно то, что видит пользователь. */
async function rotateImageFile(file: File, dir: RotateDir): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.height;
  canvas.height = bitmap.width;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  if (dir === 1) {
    ctx.translate(canvas.width, 0);
    ctx.rotate(Math.PI / 2);
  } else {
    ctx.translate(0, canvas.height);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const type = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("canvas.toBlob failed"))),
      type,
      0.92,
    ),
  );
  return new File([blob], file.name, { type });
}

export default function InvoiceDigitizePage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<DigitizeFormValues>();
  const [supplierForm] = Form.useForm<{ name: string; tax_id?: string; phone?: string }>();
  const [productForm] = Form.useForm<{
    name: string;
    kind: ProductKind;
    base_unit_id: number;
    sku?: string;
    category?: string;
  }>();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [result, setResult] = useState<DigitizedInvoiceOut | null>(null);
  const [lineMeta, setLineMeta] = useState<LineMeta[]>([]);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  /** Индекс строки, для которой создаётся новый товар (null — модалка закрыта). */
  const [productModalLine, setProductModalLine] = useState<number | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  /** Цены в накладной включают НДС («в том числе») — обычная практика РК. */
  const [vatIncluded, setVatIncluded] = useState(true);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const internal = Form.useWatch("internal", form);
  const watchedLines = Form.useWatch("lines", form);

  const isPdf =
    file != null &&
    (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));

  // objectURL живёт, пока страница показывает предпросмотр
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const products = useQuery({
    queryKey: ["products", { limit: 200 }],
    queryFn: () => listProducts({ limit: 200 }),
    staleTime: 60_000,
  });
  const units = useQuery({
    queryKey: ["units", { limit: 200 }],
    queryFn: () => listUnits({ limit: 200 }),
    staleTime: 60_000,
  });
  const warehouses = useQuery({
    queryKey: ["warehouses", { limit: 200 }],
    queryFn: () => listWarehouses({ limit: 200 }),
    staleTime: 60_000,
  });
  const suppliers = useQuery({
    queryKey: ["suppliers", { limit: 200 }],
    queryFn: () => listSuppliers({ limit: 200 }),
    staleTime: 60_000,
  });

  const productOptions = useMemo(
    () => (products.data?.items ?? []).map((p) => ({ value: p.id, label: p.name })),
    [products.data],
  );
  const unitOptions = useMemo(
    () => (units.data?.items ?? []).map((u) => ({ value: u.id, label: u.name })),
    [units.data],
  );
  const warehouseOptions = useMemo(
    () => (warehouses.data?.items ?? []).map((w) => ({ value: w.id, label: w.name })),
    [warehouses.data],
  );
  const supplierOptions = useMemo(
    () => (suppliers.data?.items ?? []).map((s) => ({ value: s.id, label: s.name })),
    [suppliers.data],
  );

  const digitize = useMutation({
    mutationFn: digitizeInvoice,
    onSuccess: (data) => {
      setResult(data);
      setLineMeta(
        data.lines.map((l) => ({
          raw_name: l.raw_name,
          score: l.product_score,
          box: l.box_2d,
          source: l.match_source,
          discount_percent: l.discount_percent,
          discount_amount: l.discount_amount,
        })),
      );
      form.setFieldsValue({
        doc_date: data.doc_date ? dayjs(data.doc_date) : dayjs(),
        internal: false,
        supplier_id: data.supplier_id ?? undefined,
        counterparty:
          data.invoice_number != null
            ? `Накладная № ${data.invoice_number}`
            : data.supplier_name_raw ?? undefined,
        lines: data.lines.map((l) => ({
          product_id: l.product_id ?? undefined,
          quantity: l.quantity ?? undefined,
          unit_id: l.unit_id ?? undefined,
          price: l.price ?? undefined,
          // распознанная ставка, иначе текущая базовая ставка НДС РК (16%)
          vat_rate: l.vat_rate ?? "16",
        })),
      });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const save = useMutation({
    mutationFn: (args: {
      body: ReceiptDocumentCreate;
      aliasPairs: { raw_text: string; product_id: number }[];
    }) => createDocument(args.body),
    onSuccess: (doc, args) => {
      // запоминаем подтверждённые пары «текст → товар»: со следующей накладной
      // эти строки сматчатся точно; сбой записи не мешает основному сценарию
      if (args.aliasPairs.length > 0) {
        saveDigitizeAliases(args.aliasPairs).catch(() => undefined);
      }
      message.success(`Черновик прихода №${doc.id} создан`);
      navigate(`/documents/${doc.id}`);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const addSupplier = useMutation({
    mutationFn: (v: { name: string; tax_id?: string; phone?: string }) =>
      createSupplier({ name: v.name, tax_id: v.tax_id || null, phone: v.phone || null }),
    onSuccess: (created) => {
      message.success(`Поставщик «${created.name}» создан`);
      setSupplierModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      form.setFieldValue("supplier_id", created.id);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const addProduct = useMutation({
    mutationFn: (v: {
      name: string;
      kind: ProductKind;
      base_unit_id: number;
      sku?: string;
      category?: string;
    }) =>
      createProduct({
        name: v.name,
        kind: v.kind,
        base_unit_id: v.base_unit_id,
        sku: v.sku || null,
        category: v.category || null,
      }),
    onSuccess: (created) => {
      message.success(`Товар «${created.name}» создан`);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      if (productModalLine != null) {
        form.setFieldValue(["lines", productModalLine, "product_id"], created.id);
        const unitSet = form.getFieldValue(["lines", productModalLine, "unit_id"]);
        if (unitSet == null) {
          form.setFieldValue(["lines", productModalLine, "unit_id"], created.base_unit_id);
        }
      }
      setProductModalLine(null);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openSupplierModal() {
    supplierForm.setFieldsValue({
      name: result?.supplier_name_raw ?? "",
      tax_id: result?.supplier_tax_id_raw ? digitsOnly(result.supplier_tax_id_raw) : undefined,
      phone: undefined,
    });
    setSupplierModalOpen(true);
  }

  function openProductModal(lineIdx: number) {
    productForm.setFieldsValue({
      name: lineMeta[lineIdx]?.raw_name ?? "",
      kind: "ingredient",
      base_unit_id: undefined as unknown as number,
      sku: undefined,
      category: undefined,
    });
    setProductModalLine(lineIdx);
  }

  /** Суммы строк формы: всего / без НДС / НДС (для сверки и шапки секции). */
  const linesTotals = useMemo(() => {
    let sum = 0;
    let net = 0;
    let vat = 0;
    for (const l of watchedLines ?? []) {
      const b = vatBreakdown(l?.quantity, l?.price, l?.vat_rate, vatIncluded);
      if (b) {
        sum += b.withVat;
        net += b.net;
        vat += b.vat;
      }
    }
    return { sum, net, vat };
  }, [watchedLines, vatIncluded]);
  const linesSum = linesTotals.sum;

  const totalsMatch =
    result?.total_amount != null && Math.abs(linesSum - Number(result.total_amount)) < 0.01;

  function submit(values: DigitizeFormValues) {
    const lines: ReceiptLineIn[] = values.lines.map((l) => ({
      product_id: l.product_id as number,
      quantity: String(l.quantity),
      unit_id: l.unit_id as number,
      price: String(l.price),
      free_goods: false,
    }));
    const body: ReceiptDocumentCreate = {
      type: "receipt",
      doc_date: values.doc_date.format("YYYY-MM-DD"),
      warehouse_id: values.warehouse_id,
      counterparty: values.counterparty?.trim() || undefined,
      internal: !!values.internal,
      supplier_id: values.internal ? undefined : values.supplier_id,
      lines,
    };
    const aliasPairs = values.lines.flatMap((l, i) => {
      const raw = lineMeta[i]?.raw_name;
      return raw && l.product_id != null
        ? [{ raw_text: raw, product_id: l.product_id }]
        : [];
    });
    save.mutate({ body, aliasPairs });
  }

  function handleFile(f: File) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setResult(null);
    setLineMeta([]);
  }

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setResult(null);
    setLineMeta([]);
    setActiveIdx(null);
    form.resetFields();
  }

  /** Поворот: всегда перерисовывает файл; после распознавания дополнительно
   *  поворачивает все зоны, чтобы разметка осталась на своих строках. */
  async function rotate(dir: RotateDir) {
    if (!file || isPdf || rotating) return;
    setRotating(true);
    try {
      const rotated = await rotateImageFile(file, dir);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(rotated);
      setPreviewUrl(URL.createObjectURL(rotated));
      if (result) {
        setResult({
          ...result,
          doc_date_box: result.doc_date_box && rotateBox(result.doc_date_box, dir),
          invoice_number_box:
            result.invoice_number_box && rotateBox(result.invoice_number_box, dir),
          supplier_name_box:
            result.supplier_name_box && rotateBox(result.supplier_name_box, dir),
          supplier_tax_id_box:
            result.supplier_tax_id_box && rotateBox(result.supplier_tax_id_box, dir),
          total_amount_box:
            result.total_amount_box && rotateBox(result.total_amount_box, dir),
        });
        setLineMeta((metas) =>
          metas.map((m) => (m.box ? { ...m, box: rotateBox(m.box, dir) } : m)),
        );
      }
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setRotating(false);
    }
  }

  function scrollToLine(idx: number) {
    setActiveIdx(idx);
    lineRefs.current[idx]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const step = result ? 1 : 0;

  const rotateButtons = !isPdf && file && (
    <Space size={4}>
      <Tooltip title="Повернуть против часовой">
        <Button
          size="small"
          icon={<RotateLeftOutlined />}
          loading={rotating}
          disabled={digitize.isPending}
          onClick={() => rotate(-1)}
        />
      </Tooltip>
      <Tooltip title="Повернуть по часовой">
        <Button
          size="small"
          icon={<RotateRightOutlined />}
          loading={rotating}
          disabled={digitize.isPending}
          onClick={() => rotate(1)}
        />
      </Tooltip>
    </Space>
  );

  // ---------- предпросмотр с зонами ----------
  const headerBoxes: { box: Box2D; label: string }[] = useMemo(() => {
    if (!result) return [];
    const out: { box: Box2D; label: string }[] = [];
    if (result.invoice_number_box) out.push({ box: result.invoice_number_box, label: "№" });
    if (result.doc_date_box) out.push({ box: result.doc_date_box, label: "Дата" });
    if (result.supplier_name_box) out.push({ box: result.supplier_name_box, label: "Поставщик" });
    if (result.supplier_tax_id_box) out.push({ box: result.supplier_tax_id_box, label: "БИН" });
    if (result.total_amount_box) out.push({ box: result.total_amount_box, label: "Итого" });
    return out;
  }, [result]);

  const imageOverlay = file && previewUrl && !isPdf && (
    <div style={{ position: "relative", lineHeight: 0 }}>
            <img
              src={previewUrl}
              alt="Накладная"
              style={{ width: "100%", display: "block", borderRadius: 6 }}
            />
            {result &&
              headerBoxes.map(({ box, label }) => (
                <div
                  key={label}
                  style={{
                    ...boxStyle(box),
                    border: "1.5px dashed #1677ff",
                    borderRadius: 3,
                    background: "rgba(22,119,255,0.06)",
                    pointerEvents: "none",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: -16,
                      left: -1,
                      fontSize: 10,
                      lineHeight: "14px",
                      padding: "0 4px",
                      borderRadius: 2,
                      background: "#1677ff",
                      color: "#fff",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {label}
                  </span>
                </div>
              ))}
            {result &&
              lineMeta.map((m, idx) => {
                if (!m.box) return null;
                const current = watchedLines?.[idx];
                if (current === undefined && (watchedLines?.length ?? 0) <= idx) return null;
                const grade = gradeOf(current?.product_id, m);
                const color = GRADE_COLOR[grade];
                const active = activeIdx === idx;
                return (
                  <div
                    key={idx}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onMouseLeave={() => setActiveIdx(null)}
                    onClick={() => scrollToLine(idx)}
                    style={{
                      ...boxStyle(m.box),
                      border: `${active ? 2.5 : 1.5}px solid ${color}`,
                      borderRadius: 3,
                      background: active ? `${color}2e` : `${color}14`,
                      cursor: "pointer",
                      transition: "background .15s, border-width .1s",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: -9,
                        left: -9,
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        background: color,
                        color: "#fff",
                        fontSize: 11,
                        lineHeight: "18px",
                        textAlign: "center",
                        fontWeight: 600,
                      }}
                    >
                      {idx + 1}
                    </span>
                  </div>
                );
              })}
    </div>
  );

  const legend = result && (
    <Space size={12} style={{ margin: "10px 4px 2px" }} wrap>
      <Badge color={GRADE_COLOR.good} text="точное / ≥ 80%" />
      <Badge color={GRADE_COLOR.weak} text="проверьте совпадение" />
      <Badge color={GRADE_COLOR.ai} text="подобрано ИИ" />
      <Badge color={GRADE_COLOR.none} text="не найден в каталоге" />
      <Badge color="#1677ff" text="реквизиты" />
    </Space>
  );

  const preview = file && previewUrl && (
    <Card
      size="small"
      title={
        <Space>
          <FileTextOutlined />
          <Typography.Text ellipsis style={{ maxWidth: 200 }}>
            {file.name}
          </Typography.Text>
        </Space>
      }
      extra={
        <Space size={4}>
          {rotateButtons}
          {!isPdf && (
            <Tooltip title="Увеличить изображение">
              <Button
                size="small"
                icon={<ZoomInOutlined />}
                onClick={() => setZoomOpen(true)}
              />
            </Tooltip>
          )}
        </Space>
      }
      style={SECTION_STYLE}
      styles={{ body: { padding: 8 }, header: SECTION_HEAD }}
    >
      {isPdf ? (
        <>
          <embed
            src={previewUrl}
            type="application/pdf"
            style={{ width: "100%", height: "70vh", border: 0, borderRadius: 6 }}
          />
          <Typography.Paragraph type="secondary" style={{ margin: "8px 4px 0", fontSize: 12 }}>
            Поворот и подсветка зон доступны для фотографий; PDF показан во встроенном
            просмотрщике.
          </Typography.Paragraph>
        </>
      ) : (
        <>
          {imageOverlay}
          {legend}
        </>
      )}
    </Card>
  );

  return (
    <div>
      <Space
        style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}
        align="start"
      >
        <div>
          <h2 style={{ margin: 0 }}>Оцифровка накладной</h2>
          <Typography.Text type="secondary">
            Фото или PDF → распознавание → проверка → черновик прихода
          </Typography.Text>
        </div>
        {file && (
          <Button onClick={reset} disabled={save.isPending || digitize.isPending}>
            Загрузить другой файл
          </Button>
        )}
      </Space>

      <Steps
        size="small"
        current={step}
        style={{ maxWidth: 640, marginBottom: 20 }}
        items={[
          { title: "Загрузка", icon: digitize.isPending ? <Spin size="small" /> : undefined },
          { title: "Проверка и правка" },
          { title: "Черновик прихода" },
        ]}
      />

      {!file && (
        <Row justify="center">
          <Col xs={24} md={16} lg={12}>
            <Upload.Dragger
              accept={ACCEPT}
              maxCount={1}
              showUploadList={false}
              beforeUpload={(f) => {
                handleFile(f);
                return false; // файл уходит нашей мутацией, без авто-загрузки
              }}
              style={{ padding: "24px 0" }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">Нажмите или перетащите файл накладной</p>
              <p className="ant-upload-hint">
                Фото (JPEG, PNG, WebP) или PDF до 12 МБ. Перед распознаванием фото можно
                повернуть, если оно снято боком.
              </p>
            </Upload.Dragger>
          </Col>
        </Row>
      )}

      {/* Этап подготовки: файл выбран, распознавание ещё не запускали */}
      {file && !result && (
        <Row justify="center" gutter={[16, 16]}>
          <Col xs={24} md={16} lg={12}>
            {preview}
            <Space
              direction="vertical"
              style={{ width: "100%", marginTop: 12 }}
              size={8}
            >
              {!isPdf && (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Если накладная лежит боком — поверните её кнопками над фото: ровное
                  изображение распознаётся заметно точнее.
                </Typography.Text>
              )}
              <Button
                type="primary"
                block
                size="large"
                icon={<ScanOutlined />}
                loading={digitize.isPending}
                disabled={rotating}
                onClick={() => digitize.mutate(file)}
              >
                {digitize.isPending ? "Распознаём накладную…" : "Распознать"}
              </Button>
              {digitize.isPending && (
                <Alert
                  type="info"
                  showIcon
                  message="Распознавание может занять до минуты"
                />
              )}
            </Space>
          </Col>
        </Row>
      )}

      {result && (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={10}>
            <div style={{ position: "sticky", top: 16 }}>{preview}</div>
          </Col>

          <Col xs={24} lg={14}>
            {result.warnings.length > 0 && (
              <Alert
                style={{ marginBottom: 12 }}
                type="warning"
                showIcon
                message="Проверьте распознанные данные"
                description={
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {result.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                }
              />
            )}

            <Card
              size="small"
              title="Распознанные реквизиты"
              style={{ ...SECTION_STYLE, marginBottom: 16 }}
              styles={{ header: SECTION_HEAD }}
            >
              <Descriptions size="small" column={{ xs: 1, sm: 2 }}>
                <Descriptions.Item label="Номер накладной">
                  {result.invoice_number ?? "—"}
                </Descriptions.Item>
                <Descriptions.Item label="Дата в документе">
                  {result.doc_date ? dayjs(result.doc_date).format("DD.MM.YYYY") : "—"}
                </Descriptions.Item>
                <Descriptions.Item label="Поставщик в документе">
                  <Space size={4} wrap>
                    {result.supplier_name_raw ?? "—"}
                    {result.supplier_id != null ? (
                      <Tag color="green" icon={<CheckCircleOutlined />}>
                        {result.supplier_matched_by === "tax_id"
                          ? "найден по БИН"
                          : "найден по названию"}
                      </Tag>
                    ) : (
                      result.supplier_name_raw != null && <Tag color="red">нет в справочнике</Tag>
                    )}
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="БИН/ИИН поставщика">
                  <Space size={4} wrap>
                    {result.supplier_tax_id_raw ?? "—"}
                    {result.supplier_tax_id_valid === true && (
                      <Tag color="green">контрольный разряд ✓</Tag>
                    )}
                    {result.supplier_tax_id_valid === false && (
                      <Tooltip title="Возможно, БИН распознан с ошибкой — сверьте с бумагой">
                        <Tag color="red">ошибка контрольного разряда</Tag>
                      </Tooltip>
                    )}
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="Итого в документе" span={2}>
                  <Space size={4}>
                    {fmtMoney(result.total_amount)}
                    {result.total_amount != null &&
                      (totalsMatch ? (
                        <Tag color="green">сумма строк сходится</Tag>
                      ) : (
                        <Tag color="orange">сумма строк: {fmtMoney(linesSum)}</Tag>
                      ))}
                  </Space>
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Form form={form} layout="vertical" onFinish={submit}>
              <Card
                size="small"
                title="Реквизиты прихода"
                style={{ ...SECTION_STYLE, marginBottom: 16 }}
                styles={{ header: SECTION_HEAD }}
              >
                <Row gutter={12}>
                  <Col xs={24} sm={8}>
                    <Form.Item
                      name="doc_date"
                      label="Дата документа"
                      rules={[{ required: true, message: "Укажите дату" }]}
                    >
                      <DatePicker style={{ width: "100%" }} format="DD.MM.YYYY" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={8}>
                    <Form.Item
                      name="warehouse_id"
                      label="Склад прихода"
                      rules={[{ required: true, message: "Выберите склад" }]}
                    >
                      <Select
                        showSearch
                        optionFilterProp="label"
                        options={warehouseOptions}
                        placeholder="Склад"
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={8}>
                    <Form.Item
                      name="internal"
                      label="Без поставщика"
                      valuePropName="checked"
                      tooltip="Внутренний приход — без привязки к поставщику и кредиторке"
                    >
                      <Switch />
                    </Form.Item>
                  </Col>
                </Row>
                {!internal && (
                  <Form.Item
                    name="supplier_id"
                    label="Поставщик"
                    extra={
                      result.supplier_name_raw != null &&
                      `Распознано: ${result.supplier_name_raw}${
                        result.supplier_tax_id_raw ? ` (БИН ${result.supplier_tax_id_raw})` : ""
                      }`
                    }
                    rules={[{ required: true, message: "Выберите поставщика" }]}
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      options={supplierOptions}
                      placeholder="Поставщик"
                      dropdownRender={(menu) => (
                        <>
                          {menu}
                          <Divider style={{ margin: "4px 0" }} />
                          <Button
                            type="link"
                            icon={<PlusOutlined />}
                            style={{ paddingLeft: 8 }}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={openSupplierModal}
                          >
                            Новый поставщик
                          </Button>
                        </>
                      )}
                    />
                  </Form.Item>
                )}
                <Form.Item name="counterparty" label="Контрагент / комментарий" style={{ margin: 0 }}>
                  <Input maxLength={256} placeholder="Необязательно" />
                </Form.Item>
              </Card>

              <Card
                size="small"
                title="Строки накладной"
                extra={
                  <Space size={12} wrap>
                    <Tooltip title="Цены в накладной уже содержат НДС («в том числе») или НДС начисляется сверху">
                      <Space size={6}>
                        <Switch
                          size="small"
                          checked={vatIncluded}
                          onChange={setVatIncluded}
                        />
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          НДС включён в цены
                        </Typography.Text>
                      </Space>
                    </Tooltip>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      итого: {fmtMoney(linesSum)}
                      {linesTotals.vat > 0 &&
                        ` · без НДС: ${fmtMoney(linesTotals.net)} · НДС: ${fmtMoney(linesTotals.vat)}`}
                    </Typography.Text>
                  </Space>
                }
                style={{ ...SECTION_STYLE, marginBottom: 16 }}
                styles={{ header: SECTION_HEAD, body: { padding: 12 } }}
              >
              <Form.List
                name="lines"
                rules={[
                  {
                    validator: async (_, lines) => {
                      if (!lines || lines.length < 1) {
                        throw new Error("Добавьте хотя бы одну строку");
                      }
                    },
                  },
                ]}
              >
                {(fields, { add, remove }, { errors }) => (
                  <>
                    {fields.map(({ key, name, ...restField }, position) => {
                      const meta = lineMeta[name] as LineMeta | undefined;
                      const current = watchedLines?.[name];
                      const grade = gradeOf(current?.product_id, meta);
                      const color = GRADE_COLOR[grade];
                      const active = activeIdx === name;
                      return (
                        <div
                          key={key}
                          ref={(el) => {
                            lineRefs.current[name] = el;
                          }}
                          onMouseEnter={() => setActiveIdx(name)}
                          onMouseLeave={() => setActiveIdx(null)}
                          style={{
                            border: `1px solid ${active ? color : "#f0f0f0"}`,
                            borderLeft: `4px solid ${color}`,
                            borderRadius: 8,
                            padding: "10px 12px 0",
                            marginBottom: 10,
                            background: active ? `${color}0a` : "#fff",
                            boxShadow: active ? `0 0 0 2px ${color}22` : undefined,
                            transition: "background .15s, box-shadow .15s, border-color .15s",
                          }}
                        >
                          <Space
                            style={{ marginBottom: 8, width: "100%", justifyContent: "space-between" }}
                            align="start"
                          >
                            <Space size={8} align="center" wrap>
                              <span
                                style={{
                                  display: "inline-block",
                                  minWidth: 20,
                                  height: 20,
                                  borderRadius: 10,
                                  background: color,
                                  color: "#fff",
                                  fontSize: 12,
                                  lineHeight: "20px",
                                  textAlign: "center",
                                  fontWeight: 600,
                                }}
                              >
                                {position + 1}
                              </span>
                              {meta?.raw_name != null ? (
                                <>
                                  <Typography.Text type="secondary">
                                    «{meta.raw_name}»
                                  </Typography.Text>
                                  {current?.product_id == null ? (
                                    <Tag color="red">не найден в каталоге</Tag>
                                  ) : meta.source === "alias" ? (
                                    <Tooltip title="Подтверждено вами на прошлых накладных">
                                      <Tag color="green">по прошлым накладным</Tag>
                                    </Tooltip>
                                  ) : meta.source === "ai" ? (
                                    <Tooltip title="Семантический выбор ИИ по каталогу — взгляните, тот ли товар">
                                      <Tag color="purple">подобрано ИИ</Tag>
                                    </Tooltip>
                                  ) : meta.score != null ? (
                                    <Tag color={grade === "good" ? "green" : "orange"}>
                                      совпадение {(meta.score * 100).toFixed(0)}%
                                    </Tag>
                                  ) : (
                                    <Tag>выбрано вручную</Tag>
                                  )}
                                  {(meta.discount_percent != null ||
                                    meta.discount_amount != null) && (
                                    <Tooltip title="Скидка из накладной — проверьте, что цена указана уже с её учётом">
                                      <Tag color="gold">
                                        скидка
                                        {meta.discount_percent != null
                                          ? ` ${meta.discount_percent}%`
                                          : ""}
                                        {meta.discount_amount != null
                                          ? ` −${fmtMoney(meta.discount_amount)}`
                                          : ""}
                                      </Tag>
                                    </Tooltip>
                                  )}
                                </>
                              ) : (
                                <Typography.Text type="secondary">
                                  добавлено вручную
                                </Typography.Text>
                              )}
                            </Space>
                            <Button
                              type="text"
                              size="small"
                              danger
                              icon={<MinusCircleOutlined />}
                              onClick={() => {
                                remove(name);
                                setLineMeta((m) => m.filter((_, i) => i !== name));
                                setActiveIdx(null);
                              }}
                            />
                          </Space>
                          <Form.Item
                            {...restField}
                            name={[name, "product_id"]}
                            label="Продукт"
                            rules={[{ required: true, message: "Выберите продукт" }]}
                          >
                            <Select
                              showSearch
                              optionFilterProp="label"
                              options={productOptions}
                              placeholder="Продукт из каталога"
                              dropdownRender={(menu) => (
                                <>
                                  {menu}
                                  <Divider style={{ margin: "4px 0" }} />
                                  <Button
                                    type="link"
                                    icon={<PlusOutlined />}
                                    style={{ paddingLeft: 8 }}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => openProductModal(name)}
                                  >
                                    Новый товар
                                  </Button>
                                </>
                              )}
                            />
                          </Form.Item>
                          <Row gutter={12}>
                            <Col span={8}>
                              <Form.Item
                                {...restField}
                                name={[name, "quantity"]}
                                label="Количество"
                                rules={[
                                  { required: true, message: "Укажите количество" },
                                  {
                                    validator: async (_: unknown, val: string) => {
                                      if (val == null || val === "") return;
                                      const n = Number(val);
                                      if (Number.isNaN(n)) throw new Error("Некорректное число");
                                      if (n <= 0) throw new Error("Количество > 0");
                                    },
                                  },
                                ]}
                              >
                                <InputNumber stringMode min="0" style={{ width: "100%" }} />
                              </Form.Item>
                            </Col>
                            <Col span={8}>
                              <Form.Item
                                {...restField}
                                name={[name, "unit_id"]}
                                label="Ед. измерения"
                                rules={[{ required: true, message: "Выберите единицу" }]}
                              >
                                <Select
                                  showSearch
                                  optionFilterProp="label"
                                  options={unitOptions}
                                  placeholder="Ед."
                                />
                              </Form.Item>
                            </Col>
                            <Col span={8}>
                              <Form.Item
                                {...restField}
                                name={[name, "price"]}
                                label="Цена (за ед.)"
                                rules={[
                                  { required: true, message: "Цена > 0" },
                                  {
                                    validator: async (_: unknown, val: string) => {
                                      if (val == null || val === "") return;
                                      const n = Number(val);
                                      if (Number.isNaN(n)) throw new Error("Некорректное число");
                                      if (n <= 0) throw new Error("Цена > 0");
                                    },
                                  },
                                ]}
                              >
                                <InputNumber stringMode min="0" style={{ width: "100%" }} />
                              </Form.Item>
                            </Col>
                          </Row>
                          {(() => {
                            const b = vatBreakdown(
                              current?.quantity,
                              current?.price,
                              current?.vat_rate,
                              vatIncluded,
                            );
                            return (
                              <div
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  alignItems: "center",
                                  gap: 12,
                                  background: "#fafafa",
                                  borderTop: "1px dashed #e5e5e5",
                                  margin: "0 -12px",
                                  padding: "6px 12px",
                                  borderRadius: "0 0 8px 8px",
                                }}
                              >
                                <Form.Item {...restField} name={[name, "vat_rate"]} noStyle>
                                  <Select
                                    size="small"
                                    style={{ width: 110 }}
                                    options={[
                                      { value: "0", label: "без НДС" },
                                      { value: "12", label: "НДС 12%" },
                                      { value: "16", label: "НДС 16%" },
                                    ]}
                                  />
                                </Form.Item>
                                {b ? (
                                  <>
                                    <Typography.Text strong>
                                      Сумма: {fmtMoney(b.withVat)}
                                    </Typography.Text>
                                    {b.vat > 0 && (
                                      <>
                                        <Typography.Text type="secondary">
                                          без НДС: {fmtMoney(b.net)}
                                        </Typography.Text>
                                        <Typography.Text type="secondary">
                                          НДС ({b.rate}%): {fmtMoney(b.vat)}
                                        </Typography.Text>
                                      </>
                                    )}
                                  </>
                                ) : (
                                  <Typography.Text type="secondary">
                                    Сумма появится после ввода количества и цены
                                  </Typography.Text>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                    <Button
                      type="dashed"
                      onClick={() => {
                        add({ vat_rate: "16" });
                        setLineMeta((m) => [...m, EMPTY_META]);
                      }}
                      icon={<PlusOutlined />}
                      block
                    >
                      Добавить строку
                    </Button>
                    <Form.ErrorList errors={errors} />
                  </>
                )}
              </Form.List>
              </Card>

              <Space style={{ marginTop: 16 }}>
                <Button type="primary" htmlType="submit" loading={save.isPending}>
                  Создать черновик прихода
                </Button>
                <Button onClick={reset} disabled={save.isPending}>
                  Отмена
                </Button>
              </Space>
            </Form>
          </Col>
        </Row>
      )}

      {/* ---------- увеличенный просмотр с зонами ---------- */}
      <Modal
        open={zoomOpen}
        onCancel={() => setZoomOpen(false)}
        footer={null}
        width="96vw"
        style={{ top: 16, maxWidth: 1600 }}
        title={
          <Space>
            <FileTextOutlined />
            {file?.name}
            {rotateButtons}
          </Space>
        }
      >
        {imageOverlay}
        {legend}
      </Modal>

      {/* ---------- новый поставщик ---------- */}
      <Modal
        title="Новый поставщик"
        open={supplierModalOpen}
        onCancel={() => setSupplierModalOpen(false)}
        onOk={() => supplierForm.submit()}
        okText="Создать поставщика"
        cancelText="Отмена"
        confirmLoading={addSupplier.isPending}
        destroyOnClose
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Сначала проверьте, нет ли поставщика в списке"
          description="Поищите в выпадающем списке по другому написанию названия. Дубликат поставщика раздвоит кредиторку и историю закупок."
        />
        <Form form={supplierForm} layout="vertical" onFinish={(v) => addSupplier.mutate(v)}>
          <Form.Item
            name="name"
            label="Название"
            rules={[{ required: true, message: "Введите название" }]}
          >
            <Input maxLength={256} placeholder="ТОО «Поставщик»" />
          </Form.Item>
          <Form.Item
            name="tax_id"
            label="БИН/ИИН"
            normalize={(v: string) => (v ? digitsOnly(v) : v)}
            rules={[
              {
                pattern: /^\d{12}$/,
                message: "БИН/ИИН — ровно 12 цифр",
              },
              {
                warningOnly: true,
                validator: async (_, value: string) => {
                  if (value && value.length === 12 && !isValidIinBin(value)) {
                    throw new Error(
                      "Не проходит проверку контрольного разряда — сверьте с документом",
                    );
                  }
                },
              },
            ]}
          >
            <Input maxLength={12} placeholder="123456789012" />
          </Form.Item>
          <Form.Item name="phone" label="Телефон">
            <Input maxLength={32} placeholder="+7 ..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* ---------- новый товар ---------- */}
      <Modal
        title="Новый товар"
        open={productModalLine != null}
        onCancel={() => setProductModalLine(null)}
        onOk={() => productForm.submit()}
        okText="Создать товар"
        cancelText="Отмена"
        confirmLoading={addProduct.isPending}
        destroyOnClose
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Сначала убедитесь, что товара нет в каталоге"
          description="Поищите в списке по другому написанию (сокращения, «в/с», латиница). Дубликат товара разведёт остатки и себестоимость по двум карточкам."
        />
        <Form form={productForm} layout="vertical" onFinish={(v) => addProduct.mutate(v)}>
          <Form.Item
            name="name"
            label="Название"
            rules={[{ required: true, message: "Введите название" }]}
          >
            <Input maxLength={256} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="kind"
                label="Тип"
                rules={[{ required: true, message: "Выберите тип" }]}
              >
                <Select
                  options={[
                    { value: "ingredient", label: "Ингредиент (сырьё)" },
                    { value: "semi_finished", label: "Полуфабрикат" },
                    { value: "dish", label: "Блюдо" },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="base_unit_id"
                label="Базовая ед. измерения"
                rules={[{ required: true, message: "Выберите единицу" }]}
              >
                <Select showSearch optionFilterProp="label" options={unitOptions} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="sku" label="Артикул (SKU)">
                <Input maxLength={64} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="category" label="Категория">
                <Input maxLength={128} placeholder="Бакалея, Молочка…" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
