/** Digitize API: распознавание накладной (фото/PDF → Gemini → черновик прихода).
 *  DTO зеркалит app/digitize/schemas.py 1:1. */
import { api } from "@/api/client";

/** Зона на исходном изображении: [ymin, xmin, ymax, xmax], нормировано к 0–1000. */
export type Box2D = [number, number, number, number] | number[];

export interface DigitizedLineOut {
  raw_name: string;
  /** Decimal как строка (или null, если не распознано). */
  quantity: string | null;
  /** Единица измерения как напечатана в документе. */
  unit_raw: string | null;
  price: string | null;
  line_total: string | null;
  /** НДС/скидка строки как напечатаны в документе (информативно). */
  vat_rate: string | null;
  vat_amount: string | null;
  discount_percent: string | null;
  discount_amount: string | null;
  product_id: number | null;
  product_name: string | null;
  /** 0..1 — уверенность сопоставления с каталогом. */
  product_score: number | null;
  unit_id: number | null;
  unit_name: string | null;
  box_2d: Box2D | null;
  /** Откуда взялся product_id: "alias" — подтверждено на прошлых накладных,
   *  "ai" — семантический выбор Gemini по каталогу, "fuzzy" — нечёткое
   *  совпадение названий, null — не найден. */
  match_source: MatchSource | null;
}

export type MatchSource = "alias" | "ai" | "fuzzy";

export interface DigitizedInvoiceOut {
  doc_date: string | null;
  doc_date_box: Box2D | null;
  invoice_number: string | null;
  invoice_number_box: Box2D | null;
  supplier_name_raw: string | null;
  supplier_name_box: Box2D | null;
  /** БИН/ИИН поставщика как распознан в документе. */
  supplier_tax_id_raw: string | null;
  supplier_tax_id_box: Box2D | null;
  /** Прошёл ли БИН/ИИН проверку контрольного разряда (null — не распознан). */
  supplier_tax_id_valid: boolean | null;
  supplier_id: number | null;
  supplier_name: string | null;
  /** Как найден поставщик: по БИН (точно) или по названию (нечётко). */
  supplier_matched_by: "tax_id" | "name" | null;
  total_amount: string | null;
  total_amount_box: Box2D | null;
  model: string;
  warnings: string[];
  lines: DigitizedLineOut[];
}

/** Запомнить подтверждённые пары «текст строки → товар» — со следующей
 *  накладной эти строки будут матчиться точно (100%). */
export async function saveDigitizeAliases(
  pairs: { raw_text: string; product_id: number }[],
): Promise<{ saved: number }> {
  const { data } = await api.post<{ saved: number }>("/digitize/aliases", { pairs });
  return data;
}

/** Распознавание идёт через Gemini и может занимать до минуты на больших PDF. */
export async function digitizeInvoice(file: File): Promise<DigitizedInvoiceOut> {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post<DigitizedInvoiceOut>("/digitize/invoice", fd, {
    timeout: 180_000,
  });
  return data;
}
