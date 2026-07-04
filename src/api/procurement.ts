/** Procurement API: suppliers, price lists, purchase orders, payments, payables.
 * DTOs mirror app/procurement/schemas.py 1:1 (Decimal -> string, date/datetime -> ISO string). */
import { api } from "@/api/client";
import type { Page, PageParams } from "@/api/client";

// ---------------- suppliers ----------------

export interface SupplierOut {
  id: number;
  organization_id: number;
  name: string;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  note: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface SupplierCreate {
  name: string;
  tax_id?: string | null;
  phone?: string | null;
  email?: string | null;
  note?: string | null;
}

export type SupplierUpdate = Partial<SupplierCreate>;

export interface SupplierListParams extends PageParams {
  active?: boolean;
}

export async function listSuppliers(params: SupplierListParams = {}): Promise<Page<SupplierOut>> {
  const { data } = await api.get<Page<SupplierOut>>("/suppliers", { params });
  return data;
}

export async function getSupplier(id: number): Promise<SupplierOut> {
  const { data } = await api.get<SupplierOut>(`/suppliers/${id}`);
  return data;
}

export async function createSupplier(body: SupplierCreate): Promise<SupplierOut> {
  const { data } = await api.post<SupplierOut>("/suppliers", body);
  return data;
}

export async function updateSupplier(id: number, body: SupplierUpdate): Promise<SupplierOut> {
  const { data } = await api.patch<SupplierOut>(`/suppliers/${id}`, body);
  return data;
}

/** Backend DELETE deactivates the supplier and returns it. */
export async function deleteSupplier(id: number): Promise<SupplierOut> {
  const { data } = await api.delete<SupplierOut>(`/suppliers/${id}`);
  return data;
}

// ---------------- price lists ----------------

export interface SupplierPriceOut {
  id: number;
  supplier_id: number;
  product_id: number;
  unit_id: number;
  price: string;
  valid_from: string | null;
  valid_to: string | null;
}

export interface SupplierPriceCreate {
  product_id: number;
  unit_id: number;
  price: string | number;
  valid_from?: string | null;
  valid_to?: string | null;
}

export async function listPrices(supplierId: number, product?: number): Promise<SupplierPriceOut[]> {
  const { data } = await api.get<SupplierPriceOut[]>(`/suppliers/${supplierId}/prices`, {
    params: { product },
  });
  return data;
}

export async function addPrice(supplierId: number, body: SupplierPriceCreate): Promise<SupplierPriceOut> {
  const { data } = await api.post<SupplierPriceOut>(`/suppliers/${supplierId}/prices`, body);
  return data;
}

export async function deletePrice(supplierId: number, priceId: number): Promise<void> {
  await api.delete(`/suppliers/${supplierId}/prices/${priceId}`);
}

// ---------------- purchase orders ----------------

export type POStatus =
  | "draft"
  | "placed"
  | "partially_received"
  | "received"
  | "closed"
  | "cancelled";

export interface POLineIn {
  product_id: number;
  unit_id: number;
  quantity_ordered: string | number;
  /** Omit/null -> backend resolves from the supplier price list. */
  price?: string | number | null;
}

export interface PurchaseOrderCreate {
  supplier_id: number;
  warehouse_id: number;
  expected_date?: string | null;
  note?: string | null;
  lines: POLineIn[];
}

export interface PurchaseOrderUpdate {
  expected_date?: string | null;
  note?: string | null;
  lines?: POLineIn[];
}

export interface POLineOut {
  id: number;
  product_id: number;
  unit_id: number;
  quantity_ordered: string;
  price: string;
  received_base_qty: string;
}

export interface POLineFulfillment {
  line_id: number;
  product_id: number;
  ordered_base: string;
  received_base: string;
  remaining_base: string;
  fully_received: boolean;
}

export interface PurchaseOrderOut {
  id: number;
  organization_id: number;
  supplier_id: number;
  warehouse_id: number;
  status: POStatus;
  number: number | null;
  expected_date: string | null;
  note: string | null;
  created_at: string;
  /** Filled only by the detail endpoints; list returns []. */
  lines: POLineOut[];
  fulfillment: POLineFulfillment[];
}

export interface PurchaseOrderListParams extends PageParams {
  supplier?: number;
  status?: POStatus;
  /** Query aliases on the backend: from/to. */
  from?: string;
  to?: string;
}

export async function listPurchaseOrders(
  params: PurchaseOrderListParams = {},
): Promise<Page<PurchaseOrderOut>> {
  const { data } = await api.get<Page<PurchaseOrderOut>>("/purchase-orders", { params });
  return data;
}

export async function getPurchaseOrder(id: number): Promise<PurchaseOrderOut> {
  const { data } = await api.get<PurchaseOrderOut>(`/purchase-orders/${id}`);
  return data;
}

export async function createPurchaseOrder(body: PurchaseOrderCreate): Promise<PurchaseOrderOut> {
  const { data } = await api.post<PurchaseOrderOut>("/purchase-orders", body);
  return data;
}

export async function updatePurchaseOrder(
  id: number,
  body: PurchaseOrderUpdate,
): Promise<PurchaseOrderOut> {
  const { data } = await api.patch<PurchaseOrderOut>(`/purchase-orders/${id}`, body);
  return data;
}

export async function placePurchaseOrder(id: number): Promise<PurchaseOrderOut> {
  const { data } = await api.post<PurchaseOrderOut>(`/purchase-orders/${id}/place`);
  return data;
}

export async function cancelPurchaseOrder(id: number): Promise<PurchaseOrderOut> {
  const { data } = await api.post<PurchaseOrderOut>(`/purchase-orders/${id}/cancel`);
  return data;
}

export async function closePurchaseOrder(id: number): Promise<PurchaseOrderOut> {
  const { data } = await api.post<PurchaseOrderOut>(`/purchase-orders/${id}/close`);
  return data;
}

// ---------------- payments ----------------

export type PaymentStatus = "active" | "voided";

export interface PaymentCreate {
  payment_date: string;
  amount: string | number;
  method?: string | null;
  note?: string | null;
}

export interface PaymentOut {
  id: number;
  supplier_id: number;
  payment_date: string;
  amount: string;
  method: string | null;
  note: string | null;
  status: PaymentStatus;
  created_at: string;
}

export async function listPayments(supplierId: number): Promise<PaymentOut[]> {
  const { data } = await api.get<PaymentOut[]>(`/suppliers/${supplierId}/payments`);
  return data;
}

export async function recordPayment(supplierId: number, body: PaymentCreate): Promise<PaymentOut> {
  const { data } = await api.post<PaymentOut>(`/suppliers/${supplierId}/payments`, body);
  return data;
}

export async function voidPayment(supplierId: number, paymentId: number): Promise<PaymentOut> {
  const { data } = await api.post<PaymentOut>(
    `/suppliers/${supplierId}/payments/${paymentId}/void`,
  );
  return data;
}

// ---------------- reports ----------------

export interface SupplierBalanceOut {
  supplier_id: number;
  supplier_name: string;
  balance: string;
}

export interface PayablesReportParams {
  as_of?: string;
  supplier?: number;
}

export async function reportPayables(
  params: PayablesReportParams = {},
): Promise<SupplierBalanceOut[]> {
  const { data } = await api.get<SupplierBalanceOut[]>("/reports/payables", { params });
  return data;
}

export type PayableSourceType = "receipt" | "payment" | "payment_void";

export interface PayableEntryOut {
  id: number;
  supplier_id: number;
  amount_delta: string;
  balance_after: string;
  source_type: PayableSourceType;
  source_id: number;
  entry_date: string;
  posting_seq: number;
}

export interface PayableLedgerPage {
  items: PayableEntryOut[];
  next_after_seq: number | null;
}

export async function supplierLedger(
  supplierId: number,
  params: { after_seq?: number; limit?: number } = {},
): Promise<PayableLedgerPage> {
  const { data } = await api.get<PayableLedgerPage>(`/suppliers/${supplierId}/ledger`, { params });
  return data;
}

// ------- cross-module reference reads (catalog/inventory) for selects -------
// Partial views of ProductOut/UnitOut/WarehouseOut: only the fields this module
// reads. No dedicated catalog/inventory api file exists yet to import from.

export interface ProductRef {
  id: number;
  name: string;
  base_unit_id: number;
  is_active: boolean;
}

export interface UnitRef {
  id: number;
  name: string;
  dimension: string;
}

export interface WarehouseRef {
  id: number;
  name: string;
  is_active: boolean;
}

export async function listProductRefs(): Promise<ProductRef[]> {
  const { data } = await api.get<Page<ProductRef>>("/products", { params: { limit: 200 } });
  return data.items;
}

export async function listUnitRefs(): Promise<UnitRef[]> {
  const { data } = await api.get<Page<UnitRef>>("/units", { params: { limit: 200 } });
  return data.items;
}

export async function listWarehouseRefs(): Promise<WarehouseRef[]> {
  const { data } = await api.get<Page<WarehouseRef>>("/warehouses", { params: { limit: 200 } });
  return data.items;
}
