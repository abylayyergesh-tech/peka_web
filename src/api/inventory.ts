/** Inventory API: warehouses & stock documents. DTOs mirror app/inventory/schemas.py.
 *  Also exposes light catalog/supplier fetchers used by document forms & reports. */
import { api } from "@/api/client";
import type { Page, PageParams } from "@/api/client";

// --------------------------- warehouses ---------------------------
export interface WarehouseOut {
  id: number;
  organization_id: number;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
}

export async function listWarehouses(
  params: PageParams & { include_inactive?: boolean },
): Promise<Page<WarehouseOut>> {
  const { data } = await api.get<Page<WarehouseOut>>("/warehouses", { params });
  return data;
}

export async function createWarehouse(body: { name: string }): Promise<WarehouseOut> {
  const { data } = await api.post<WarehouseOut>("/warehouses", body);
  return data;
}

/** Soft-delete (deactivate) — backend has no rename/update endpoint. */
export async function deleteWarehouse(id: number): Promise<WarehouseOut> {
  const { data } = await api.delete<WarehouseOut>(`/warehouses/${id}`);
  return data;
}

// --------------------------- documents ---------------------------
export type DocumentType =
  | "receipt"
  | "write_off"
  | "transfer"
  | "production"
  | "sale"
  | "inventory_count";

export type DocumentStatus = "draft" | "posted";

/** Decimals travel as strings (backend Decimal). */
export interface ReceiptLineIn {
  product_id: number;
  quantity: string;
  unit_id: number;
  price?: string | null;
  free_goods?: boolean;
  purchase_order_line_id?: number | null;
}

export interface ConsumptionLineIn {
  product_id: number;
  quantity: string;
  unit_id: number;
}

export interface InventoryCountLineIn {
  product_id: number;
  quantity: string;
  unit_id: number;
  expected_quantity?: string | null;
  price?: string | null;
}

export interface ReceiptDocumentCreate {
  type: "receipt";
  doc_date: string;
  warehouse_id: number;
  counterparty?: string | null;
  supplier_id?: number | null;
  purchase_order_id?: number | null;
  internal: boolean;
  lines: ReceiptLineIn[];
}

interface _BaseConsumptionCreate {
  doc_date: string;
  warehouse_id: number;
  counterparty?: string | null;
  lines: ConsumptionLineIn[];
}

export interface WriteOffDocumentCreate extends _BaseConsumptionCreate {
  type: "write_off";
}

export interface TransferDocumentCreate extends _BaseConsumptionCreate {
  type: "transfer";
  target_warehouse_id: number;
}

export interface ProductionDocumentCreate extends _BaseConsumptionCreate {
  type: "production";
}

export interface SaleDocumentCreate extends _BaseConsumptionCreate {
  type: "sale";
}

export interface InventoryCountDocumentCreate {
  type: "inventory_count";
  doc_date: string;
  warehouse_id: number;
  counterparty?: string | null;
  lines: InventoryCountLineIn[];
}

export type DocumentCreate =
  | ReceiptDocumentCreate
  | WriteOffDocumentCreate
  | TransferDocumentCreate
  | ProductionDocumentCreate
  | SaleDocumentCreate
  | InventoryCountDocumentCreate;

export interface DocumentLineOut {
  id: number;
  product_id: number;
  quantity: string;
  unit_id: number;
  price: string | null;
  expected_quantity: string | null;
}

export interface DocumentOut {
  id: number;
  organization_id: number;
  type: DocumentType;
  number: number | null;
  doc_date: string;
  status: DocumentStatus;
  warehouse_id: number;
  target_warehouse_id: number | null;
  counterparty: string | null;
  recipe_id: number | null;
  posted_at: string | null;
  created_at: string;
  lines: DocumentLineOut[];
}

export interface DocumentListParams extends PageParams {
  type?: DocumentType;
  status?: DocumentStatus;
  /** query aliases: from / to (ISO date). */
  from?: string;
  to?: string;
}

export async function listDocuments(
  params: DocumentListParams,
): Promise<Page<DocumentOut>> {
  const { data } = await api.get<Page<DocumentOut>>("/documents", { params });
  return data;
}

export async function getDocument(id: number): Promise<DocumentOut> {
  const { data } = await api.get<DocumentOut>(`/documents/${id}`);
  return data;
}

export async function createDocument(body: DocumentCreate): Promise<DocumentOut> {
  const { data } = await api.post<DocumentOut>("/documents", body);
  return data;
}

/** PATCH replaces the whole draft (backend takes the full DocumentCreate body). */
export async function updateDocument(
  id: number,
  body: DocumentCreate,
): Promise<DocumentOut> {
  const { data } = await api.patch<DocumentOut>(`/documents/${id}`, body);
  return data;
}

export async function deleteDocument(id: number): Promise<void> {
  await api.delete(`/documents/${id}`);
}

export async function postDocument(id: number): Promise<DocumentOut> {
  const { data } = await api.post<DocumentOut>(`/documents/${id}/post`);
  return data;
}

// --------------------- catalog / supplier lookups ---------------------
export type ProductKind = "ingredient" | "semi_finished" | "dish";

export interface ProductOut {
  id: number;
  organization_id: number;
  name: string;
  sku: string | null;
  category: string | null;
  base_unit_id: number;
  kind: ProductKind;
  is_active: boolean;
}

export async function listProducts(
  params: PageParams & { kind?: string; include_inactive?: boolean },
): Promise<Page<ProductOut>> {
  const { data } = await api.get<Page<ProductOut>>("/products", { params });
  return data;
}

export interface SupplierOut {
  id: number;
  organization_id: number;
  name: string;
  is_active: boolean;
}

export async function listSuppliers(
  params: PageParams & { include_inactive?: boolean },
): Promise<Page<SupplierOut>> {
  const { data } = await api.get<Page<SupplierOut>>("/suppliers", { params });
  return data;
}
