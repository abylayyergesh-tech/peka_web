/** Sales/POS API: menu, shifts, checks, receipts, customers, receivables.
 * DTOs mirror app/sales/schemas.py 1:1 (backend Decimal -> string). */
import { api } from "@/api/client";
import type { Page, PageParams } from "@/api/client";

export type DiscountType = "percent" | "amount";
export type PaymentMethod = "cash" | "card" | "credit";

// ---- menu ----

export interface MenuItemOut {
  id: number;
  organization_id: number;
  name: string;
  product_id: number;
  unit_id: number;
  portion_qty: string;
  sale_price: string;
  category: string | null;
  is_active: boolean;
}

export interface MenuItemCreate {
  name: string;
  product_id: number;
  unit_id: number;
  portion_qty?: number | string;
  sale_price: number | string;
  category?: string | null;
}

export interface MenuItemUpdate {
  name?: string;
  product_id?: number;
  unit_id?: number;
  portion_qty?: number | string;
  sale_price?: number | string;
  category?: string | null;
  is_active?: boolean;
}

export interface MenuItemListParams extends PageParams {
  active?: boolean;
  category?: string;
}

export async function listMenuItems(params: MenuItemListParams): Promise<Page<MenuItemOut>> {
  const { data } = await api.get<Page<MenuItemOut>>("/menu-items", { params });
  return data;
}

export async function createMenuItem(body: MenuItemCreate): Promise<MenuItemOut> {
  const { data } = await api.post<MenuItemOut>("/menu-items", body);
  return data;
}

export async function updateMenuItem(id: number, body: MenuItemUpdate): Promise<MenuItemOut> {
  const { data } = await api.patch<MenuItemOut>(`/menu-items/${id}`, body);
  return data;
}

/** Backend DELETE deactivates (is_active=false) and returns the item. */
export async function deleteMenuItem(id: number): Promise<MenuItemOut> {
  const { data } = await api.delete<MenuItemOut>(`/menu-items/${id}`);
  return data;
}

// ---- customers ----

export interface CustomerOut {
  id: number;
  organization_id: number;
  name: string;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  note: string | null;
  credit_limit: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface CustomerCreate {
  name: string;
  tax_id?: string | null;
  phone?: string | null;
  email?: string | null;
  note?: string | null;
  credit_limit?: number | string | null;
}

export type CustomerUpdate = Partial<CustomerCreate>;

export interface CustomerListParams extends PageParams {
  active?: boolean;
}

export async function listCustomers(params: CustomerListParams): Promise<Page<CustomerOut>> {
  const { data } = await api.get<Page<CustomerOut>>("/customers", { params });
  return data;
}

export async function getCustomer(id: number): Promise<CustomerOut> {
  const { data } = await api.get<CustomerOut>(`/customers/${id}`);
  return data;
}

export async function createCustomer(body: CustomerCreate): Promise<CustomerOut> {
  const { data } = await api.post<CustomerOut>("/customers", body);
  return data;
}

export async function updateCustomer(id: number, body: CustomerUpdate): Promise<CustomerOut> {
  const { data } = await api.patch<CustomerOut>(`/customers/${id}`, body);
  return data;
}

/** Backend DELETE deactivates (is_active=false) and returns the customer. */
export async function deleteCustomer(id: number): Promise<CustomerOut> {
  const { data } = await api.delete<CustomerOut>(`/customers/${id}`);
  return data;
}

// ---- customer payments / receivables ----

export interface CustomerPaymentCreate {
  payment_date: string; // YYYY-MM-DD
  amount: number | string;
  method?: string | null;
  note?: string | null;
}

export interface CustomerPaymentOut {
  id: number;
  customer_id: number;
  payment_date: string;
  amount: string;
  method: string | null;
  note: string | null;
  status: string; // active | voided
  created_at: string;
}

export async function listCustomerPayments(customerId: number): Promise<CustomerPaymentOut[]> {
  const { data } = await api.get<CustomerPaymentOut[]>(`/customers/${customerId}/payments`);
  return data;
}

export async function recordCustomerPayment(
  customerId: number,
  body: CustomerPaymentCreate,
): Promise<CustomerPaymentOut> {
  const { data } = await api.post<CustomerPaymentOut>(`/customers/${customerId}/payments`, body);
  return data;
}

export async function voidCustomerPayment(
  customerId: number,
  paymentId: number,
): Promise<CustomerPaymentOut> {
  const { data } = await api.post<CustomerPaymentOut>(
    `/customers/${customerId}/payments/${paymentId}/void`,
  );
  return data;
}

export interface ReceivableEntryOut {
  id: number;
  customer_id: number;
  amount_delta: string;
  balance_after: string;
  source_type: string; // check | payment | payment_void
  source_id: number;
  entry_date: string;
  posting_seq: number;
}

export interface ReceivableLedgerPage {
  items: ReceivableEntryOut[];
  next_after_seq: number | null;
}

export async function customerLedger(
  customerId: number,
  params: { after_seq?: number; limit?: number },
): Promise<ReceivableLedgerPage> {
  const { data } = await api.get<ReceivableLedgerPage>(`/customers/${customerId}/ledger`, {
    params,
  });
  return data;
}

export interface CustomerBalanceOut {
  customer_id: number;
  customer_name: string;
  balance: string;
}

export async function reportReceivables(params: {
  as_of?: string;
  customer?: number;
}): Promise<CustomerBalanceOut[]> {
  const { data } = await api.get<CustomerBalanceOut[]>("/reports/receivables", { params });
  return data;
}

export interface SalesReport {
  check_count: number;
  gross: string;
  discount_total: string;
  revenue: string;
  by_method: Record<string, string>;
}

export async function reportSales(params: {
  date_from?: string;
  date_to?: string;
  shift_id?: number;
}): Promise<SalesReport> {
  const { data } = await api.get<SalesReport>("/reports/sales", { params });
  return data;
}

// ---- shifts ----

export interface ShiftOpen {
  warehouse_id: number;
  opening_float?: number | string;
}

export interface ShiftOut {
  id: number;
  organization_id: number;
  warehouse_id: number;
  status: string; // open | closed
  number: number | null;
  opening_float: string;
  opened_at: string;
  closed_at: string | null;
}

export interface ShiftTotals {
  check_count: number;
  gross: string;
  discount_total: string;
  revenue: string;
  by_method: Record<string, string>;
  expected_cash: string;
}

export interface ShiftReport {
  shift: ShiftOut;
  totals: ShiftTotals;
}

export interface ShiftListParams extends PageParams {
  status?: string;
  warehouse?: number;
  date_from?: string;
  date_to?: string;
}

export async function openShift(body: ShiftOpen): Promise<ShiftOut> {
  const { data } = await api.post<ShiftOut>("/shifts/open", body);
  return data;
}

export async function listShifts(params: ShiftListParams): Promise<Page<ShiftOut>> {
  const { data } = await api.get<Page<ShiftOut>>("/shifts", { params });
  return data;
}

export async function getShift(id: number): Promise<ShiftReport> {
  const { data } = await api.get<ShiftReport>(`/shifts/${id}`);
  return data;
}

export async function closeShift(id: number): Promise<ShiftReport> {
  const { data } = await api.post<ShiftReport>(`/shifts/${id}/close`);
  return data;
}

// ---- checks ----

export interface CheckCreate {
  warehouse_id: number;
  customer_id?: number | null;
}

export interface CheckLineIn {
  menu_item_id: number;
  quantity: number | string;
  discount_type?: DiscountType | null;
  discount_value?: number | string | null;
}

export interface CheckDiscountIn {
  discount_type?: DiscountType | null;
  discount_value?: number | string | null;
  customer_id?: number | null;
}

export interface CheckCloseIn {
  payment_method: PaymentMethod;
  customer_id?: number | null;
}

export interface CheckLineOut {
  id: number;
  menu_item_id: number;
  quantity: string;
  unit_price: string;
  discount_type: string | null;
  discount_value: string | null;
  line_total: string;
}

export interface CheckOut {
  id: number;
  organization_id: number;
  shift_id: number;
  warehouse_id: number;
  number: number | null;
  status: string; // open | paid | voided
  customer_id: number | null;
  discount_type: string | null;
  discount_value: string | null;
  subtotal: string;
  discount_total: string;
  total: string;
  payment_method: string | null;
  inventory_document_id: number | null;
  fiscal_status: string;
  lines: CheckLineOut[];
}

export interface CheckWarning {
  product_id: number;
  warehouse_id: number;
  resulting_quantity: string;
  cost_estimated: boolean;
}

export interface CheckCloseResult {
  check: CheckOut;
  warnings: CheckWarning[];
}

export interface CheckListParams extends PageParams {
  shift?: number;
  status?: string;
  date_from?: string;
  date_to?: string;
}

export async function createCheck(body: CheckCreate): Promise<CheckOut> {
  const { data } = await api.post<CheckOut>("/checks", body);
  return data;
}

export async function listChecks(params: CheckListParams): Promise<Page<CheckOut>> {
  const { data } = await api.get<Page<CheckOut>>("/checks", { params });
  return data;
}

export async function getCheck(id: number): Promise<CheckOut> {
  const { data } = await api.get<CheckOut>(`/checks/${id}`);
  return data;
}

export async function addCheckLine(checkId: number, body: CheckLineIn): Promise<CheckOut> {
  const { data } = await api.post<CheckOut>(`/checks/${checkId}/lines`, body);
  return data;
}

export async function updateCheckLine(
  checkId: number,
  lineId: number,
  body: CheckLineIn,
): Promise<CheckOut> {
  const { data } = await api.patch<CheckOut>(`/checks/${checkId}/lines/${lineId}`, body);
  return data;
}

export async function removeCheckLine(checkId: number, lineId: number): Promise<CheckOut> {
  const { data } = await api.delete<CheckOut>(`/checks/${checkId}/lines/${lineId}`);
  return data;
}

/** Check-level discount and/or customer (only while the check is open). */
export async function updateCheck(id: number, body: CheckDiscountIn): Promise<CheckOut> {
  const { data } = await api.patch<CheckOut>(`/checks/${id}`, body);
  return data;
}

export async function voidCheck(id: number): Promise<CheckOut> {
  const { data } = await api.post<CheckOut>(`/checks/${id}/void`);
  return data;
}

export async function closeCheck(id: number, body: CheckCloseIn): Promise<CheckCloseResult> {
  const { data } = await api.post<CheckCloseResult>(`/checks/${id}/close`, body);
  return data;
}

// ---- receipts ----

export interface ReceiptOut {
  id: number;
  check_id: number;
  content: string;
  payload: Record<string, unknown>;
  printed_at: string | null;
  print_count: number;
}

export async function getReceipt(checkId: number): Promise<ReceiptOut> {
  const { data } = await api.get<ReceiptOut>(`/checks/${checkId}/receipt`);
  return data;
}

export async function printReceipt(checkId: number): Promise<ReceiptOut> {
  const { data } = await api.post<ReceiptOut>(`/checks/${checkId}/print`);
  return data;
}

// ---- lookups from adjacent modules (read-only, for selects) ----
// Minimal projections of catalog/inventory DTOs; endpoints are member-readable.

export interface ProductLookup {
  id: number;
  name: string;
}

export interface UnitLookup {
  id: number;
  name: string;
}

export interface WarehouseLookup {
  id: number;
  name: string;
}

export async function listProductsLookup(): Promise<Page<ProductLookup>> {
  const { data } = await api.get<Page<ProductLookup>>("/products", { params: { limit: 200 } });
  return data;
}

export async function listUnitsLookup(): Promise<Page<UnitLookup>> {
  const { data } = await api.get<Page<UnitLookup>>("/units", { params: { limit: 200 } });
  return data;
}

export async function listWarehousesLookup(): Promise<Page<WarehouseLookup>> {
  const { data } = await api.get<Page<WarehouseLookup>>("/warehouses", { params: { limit: 200 } });
  return data;
}
