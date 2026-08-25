/** Sales/POS API: menu, shifts, checks, receipts, customers, receivables.
 * DTOs mirror app/sales/schemas.py 1:1 (backend Decimal -> string). */
import { api, fetchAllPages } from "@/api/client";
import type { Page, PageParams } from "@/api/client";
import type { NutrientsOut } from "@/api/catalog";

export type DiscountType = "percent" | "amount";
export type PaymentMethod = "cash" | "card" | "credit";

// ---- menus (прайс-листы) ----
// Базовая цена позиции живёт в menu_items.sale_price — это «Основное меню»
// (is_default). Остальные меню задают только отклонения: см. MenuPriceOut.

export interface MenuOut {
  menu_id: number;
  organization_id: number;
  name: string;
  /** Код ценовой категории iiko, если меню пришло из выгрузки. */
  code: string | null;
  is_default: boolean;
  is_active: boolean;
}

export interface MenuCreate {
  name: string;
  code?: string | null;
  is_default?: boolean;
}

export interface MenuUpdate {
  name?: string;
  code?: string | null;
  is_default?: boolean;
  is_active?: boolean;
}

export interface MenuPriceOut {
  menu_price_id: number;
  menu_id: number;
  menu_item_id: number;
  /** null вместе с is_included=false — позиция исключена из меню. */
  price: string | null;
  is_included: boolean;
}

export interface MenuPriceIn {
  menu_item_id: number;
  /** null при is_included=true — «нет отклонения», строка будет удалена. */
  price?: number | string | null;
  is_included?: boolean;
}

export interface MenuPricesIn {
  prices: MenuPriceIn[];
  /** true — заменить прайс меню целиком (неперечисленные отклонения удаляются). */
  replace?: boolean;
}

/** Позиция с ценой, действующей для конкретного меню или клиента. */
export interface MenuItemPricedOut {
  menu_item_id: number;
  name: string;
  category: string | null;
  unit_id: number;
  portion_qty: string;
  base_price: string;
  price: string;
  /** true — цена из menu_prices, а не базовая. */
  is_overridden: boolean;
}

export interface MenuItemPricedParams extends PageParams {
  menu_id?: number;
  /** Приоритетнее menu_id: цены меню этого клиента. */
  customer_id?: number;
  active?: boolean;
  category?: string;
  search?: string;
  sort?: string;
}

export async function listMenus(params?: { active?: boolean }): Promise<MenuOut[]> {
  const { data } = await api.get<MenuOut[]>("/menus", { params });
  return data;
}

export async function getMenu(id: number): Promise<MenuOut> {
  const { data } = await api.get<MenuOut>(`/menus/${id}`);
  return data;
}

export async function createMenu(body: MenuCreate): Promise<MenuOut> {
  const { data } = await api.post<MenuOut>("/menus", body);
  return data;
}

export async function updateMenu(id: number, body: MenuUpdate): Promise<MenuOut> {
  const { data } = await api.patch<MenuOut>(`/menus/${id}`, body);
  return data;
}

/** Backend DELETE deactivates (is_active=false); 409 если меню уже используется. */
export async function deleteMenu(id: number): Promise<MenuOut> {
  const { data } = await api.delete<MenuOut>(`/menus/${id}`);
  return data;
}

export async function listMenuPrices(menuId: number): Promise<MenuPriceOut[]> {
  const { data } = await api.get<MenuPriceOut[]>(`/menus/${menuId}/prices`);
  return data;
}

/** Пачка отклонений одним запросом — по одной позиции прайс не заводят. */
export async function setMenuPrices(
  menuId: number,
  body: MenuPricesIn,
): Promise<MenuPriceOut[]> {
  const { data } = await api.put<MenuPriceOut[]>(`/menus/${menuId}/prices`, body);
  return data;
}

export async function listMenuItemsPriced(
  params: MenuItemPricedParams,
): Promise<Page<MenuItemPricedOut>> {
  const { data } = await api.get<Page<MenuItemPricedOut>>("/menu-items/priced", { params });
  return data;
}

// ---- menu ----

export interface MenuItemOut {
  menu_item_id: number;
  organization_id: number;
  name: string;
  product_id: number;
  unit_id: number;
  portion_qty: string;
  sale_price: string;
  category: string | null;
  /** Фото для витрины клиентского сайта — ссылкой; null — там будет заглушка. */
  image_url: string | null;
  is_active: boolean;
}

export interface MenuItemCreate {
  name: string;
  product_id: number;
  unit_id: number;
  portion_qty?: number | string;
  sale_price: number | string;
  category?: string | null;
  image_url?: string | null;
}

export interface MenuItemUpdate {
  name?: string;
  product_id?: number;
  unit_id?: number;
  portion_qty?: number | string;
  sale_price?: number | string;
  category?: string | null;
  image_url?: string | null;
  is_active?: boolean;
}

/** Загрузить фото позиции: файл уходит НА БЭКЕНД, он кладёт его в GCS и
 *  возвращает позицию с готовой ссылкой. Прямо в бакет из браузера нельзя — там
 *  запрещён анонимный доступ, и это правильно. */
export async function uploadMenuItemImage(
  id: number,
  file: File,
): Promise<MenuItemOut> {
  const form = new FormData();
  form.append("file", file);
  // Content-Type с boundary axios подставит сам — задавать его руками нельзя.
  const { data } = await api.post<MenuItemOut>(`/menu-items/${id}/image`, form);
  return data;
}

/** Убрать фото: и ссылку из карточки, и файл из бакета. */
export async function deleteMenuItemImage(id: number): Promise<MenuItemOut> {
  const { data } = await api.delete<MenuItemOut>(`/menu-items/${id}/image`);
  return data;
}

export interface MenuItemListParams extends PageParams {
  active?: boolean;
  category?: string;
  /** Подстрока в названии (регистр не важен). */
  search?: string;
  /** `name|sale_price|category|created_at`, с «-» — по убыванию. */
  sort?: string;
}

export async function listMenuItems(params: MenuItemListParams): Promise<Page<MenuItemOut>> {
  const { data } = await api.get<Page<MenuItemOut>>("/menu-items", { params });
  return data;
}

/** ВСЕ позиции меню, постранично. Экранам, которым нужен полный список (прайс
 *  меню, выпадающие списки), нельзя просто попросить `limit: 500`: бэкенд
 *  ограничивает страницу двумя сотнями (`le=200`) и на большем значении отвечает
 *  422, а не усечённым списком — экран получал пустоту вместо данных. */
export async function listAllMenuItems(
  params: Omit<MenuItemListParams, "limit" | "offset"> = {},
): Promise<MenuItemOut[]> {
  return fetchAllPages<MenuItemOut>((p) =>
    api.get<Page<MenuItemOut>>("/menu-items", { params: { ...params, ...p } })
      .then((r) => r.data));
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

/** Порядок расчётов клиента:
 *  weekly    — сводный счёт раз в неделю, оплата переводом (договорные кофейни);
 *  per_order — счёт на каждый заказ в клиентском портале. */
export type BillingMode = "weekly" | "per_order";

export interface CustomerOut {
  customer_id: number;
  organization_id: number;
  /** Как клиента называет цех («Кофейня "Утро"»); он видит это же название у
   *  себя в профиле как «название заведения». */
  name: string;
  /** Юрлицо для счёта («ТОО "Абадан"», «ИП Иванов»). */
  legal_name: string | null;
  tax_id: string | null;
  /** Расчётный счёт (IBAN). */
  bank_account: string | null;
  phone: string | null;
  email: string | null;
  note: string | null;
  credit_limit: string | null;
  /** Прайс-лист клиента; null — платит по базовым ценам («Основное меню»). */
  menu_id: number | null;
  billing_mode: BillingMode;
  /** К какому НАШЕМУ юр. лицу отнесён клиент: от его имени с ним работают, и в
   *  его дебиторку попадает долг. null — ни к какому. */
  company_entity_id: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface CustomerCreate {
  name: string;
  legal_name?: string | null;
  tax_id?: string | null;
  bank_account?: string | null;
  phone?: string | null;
  email?: string | null;
  note?: string | null;
  credit_limit?: number | string | null;
  menu_id?: number | null;
  /** Не задан — бэкенд заводит клиента на оплату по каждому заказу. */
  billing_mode?: BillingMode;
  /** Наше юр. лицо, к которому относится клиент. */
  company_entity_id?: number | null;
}

export type CustomerUpdate = Partial<CustomerCreate>;

export interface CustomerListParams extends PageParams {
  active?: boolean;
  billing_mode?: BillingMode;
}

export async function listCustomers(params: CustomerListParams): Promise<Page<CustomerOut>> {
  const { data } = await api.get<Page<CustomerOut>>("/customers", { params });
  return data;
}

/** ВСЕ клиенты, постранично — для выпадающих списков и отчётов. См. коммент к
 *  `listAllMenuItems`: `/customers` тоже ограничен `le=200`. */
export async function listAllCustomers(
  params: Omit<CustomerListParams, "limit" | "offset"> = {},
): Promise<CustomerOut[]> {
  return fetchAllPages<CustomerOut>((p) =>
    api.get<Page<CustomerOut>>("/customers", { params: { ...params, ...p } })
      .then((r) => r.data));
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
  /** На какое наше юр. лицо пришли деньги. Пусто — то, к которому отнесён клиент. */
  company_entity_id?: number | null;
}

export interface CustomerPaymentOut {
  customer_payment_id: number;
  /** На какое наше юр. лицо пришли деньги. */
  company_entity_id: number | null;
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
  receivable_entry_id: number;
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
  /** К какому нашему юр. лицу отнесён клиент; null — ни к какому. */
  company_entity_id: number | null;
  /** Начислено в долг за всё время. */
  total_charged: string;
  /** Оплачено (отменённый платёж из суммы уходит). */
  total_paid: string;
  balance: string;
}

export async function reportReceivables(params: {
  as_of?: string;
  customer?: number;
  /** id нашего юр. лица или "none" — только записи без юр. лица. */
  company_entity?: string;
}): Promise<CustomerBalanceOut[]> {
  const { data } = await api.get<CustomerBalanceOut[]>("/reports/receivables", { params });
  return data;
}

export interface SalesReport {
  check_count: number;
  gross: string;
  discount_total: string;
  /** Доставка как услуга: входит в revenue, но не в gross. */
  delivery_total: string;
  revenue: string;
  by_method: Record<string, string>;
  /** Выручка по прайс-листам — по снимку меню в строках чека, поэтому
   * переназначение меню клиенту не меняет прошлые периоды. Суммируется до
   * gross (без доставки и скидки уровня чека), не до revenue. */
  by_menu: Record<string, string>;
}

export async function reportSales(params: {
  /** Границы периода. Имена канонические (`from`/`to`) — те же во всём API. */
  from?: string;
  to?: string;
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
  shift_id: number;
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
  /** Доставка как услуга: входит в revenue, но не в gross. */
  delivery_total: string;
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
  /** Границы периода. Имена канонические (`from`/`to`) — те же во всём API. */
  from?: string;
  to?: string;
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

export interface MenuItemNutritionOut {
  menu_item_id: number;
  product_id: number;
  /** На порцию — то есть на выход позиции меню. */
  per_portion: NutrientsOut;
  per_100g: NutrientsOut | null;
  portion_weight_kg: string | null;
  source: "own" | "recipe";
  complete: boolean;
  missing_products: number[];
  missing_product_names: string[];
}

/** КБЖУ порции: расчёт по тех-карте продукта × выход позиции. */
export async function getMenuItemNutrition(
  id: number,
): Promise<MenuItemNutritionOut> {
  const { data } = await api.get<MenuItemNutritionOut>(`/menu-items/${id}/nutrition`);
  return data;
}

export interface ShiftReceiptOut {
  shift_id: number;
  /** Готовый моноширинный текст — то же, что уйдёт на печать. */
  content: string;
  payload: Record<string, unknown>;
}

/** Чек за смену. `items` добавляет все проданные позиции, свёрнутые по
 *  наименованию (полный чек), иначе это Z-отчёт с одними итогами. */
export async function getShiftReceipt(
  id: number,
  opts?: { items?: boolean },
): Promise<ShiftReceiptOut> {
  const { data } = await api.get<ShiftReceiptOut>(`/shifts/${id}/receipt`, {
    params: opts?.items ? { items: true } : undefined,
  });
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
  /** Замена по просьбе клиента: цена 0, но со склада списывается как продажа.
   * Требует контрагента в чеке; скидку к замене бэкенд не примет. */
  is_replacement?: boolean;
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
  check_line_id: number;
  menu_item_id: number;
  quantity: string;
  unit_price: string;
  /** true — позиция отдана как замена: 0 ₸ выручки, но списана со склада. */
  is_replacement: boolean;
  discount_type: string | null;
  discount_value: string | null;
  line_total: string;
}

// ---- точки клиента (адреса) ----
// Клиент — это юрлицо: у сети кофеен один БИН и один клиент, а адресов много.
// Если БИН не указан, точка самостоятельна. Ручки живут в модуле portal
// (`customer_addresses` — та же таблица, что и адреса доставки клиентского сайта).

export interface CustomerAddressOut {
  customer_address_id: number;
  customer_id: number;
  /** Название точки; из iiko приезжало как «кофейня, адрес». */
  label: string | null;
  address_line: string;
  contact_name: string | null;
  contact_phone: string | null;
  comment: string | null;
  is_default: boolean;
  is_active: boolean;
}

export interface CustomerAddressCreate {
  address_line: string;
  label?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  comment?: string | null;
  is_default?: boolean;
}

export type CustomerAddressUpdate = Partial<CustomerAddressCreate> & {
  is_active?: boolean;
};

/** Все точки клиента, включая деактивированные (их держат прошлые заказы). */
export async function listCustomerAddresses(
  customerId: number,
): Promise<CustomerAddressOut[]> {
  const { data } = await api.get<CustomerAddressOut[]>(
    `/customers/${customerId}/portal-addresses`,
  );
  return data;
}

export async function createCustomerAddress(
  customerId: number,
  body: CustomerAddressCreate,
): Promise<CustomerAddressOut> {
  const { data } = await api.post<CustomerAddressOut>(
    `/customers/${customerId}/portal-addresses`, body);
  return data;
}

export async function updateCustomerAddress(
  addressId: number,
  body: CustomerAddressUpdate,
): Promise<CustomerAddressOut> {
  const { data } = await api.patch<CustomerAddressOut>(
    `/portal-addresses/${addressId}`, body);
  return data;
}

/** Backend DELETE deactivates: на точку ссылаются прошлые заказы и чеки. */
export async function deleteCustomerAddress(
  addressId: number,
): Promise<CustomerAddressOut> {
  const { data } = await api.delete<CustomerAddressOut>(
    `/portal-addresses/${addressId}`);
  return data;
}

// ---- замены ----
// Клиент звонит и просит замену; в следующем заказе оператор ставит галочку на
// нужных позициях — они уходят бесплатно, но списываются со склада.

export interface ReplacementRow {
  replacement_id: number;
  customer_id: number;
  customer_name: string;
  menu_item_id: number;
  menu_item_name: string;
  quantity: string;
  /** Недополученная выручка: цена прайс-листа клиента × количество. */
  waived_amount: string;
  replacement_date: string;
  order_id: number | null;
  check_id: number | null;
  note: string | null;
  created_at: string;
}

export interface ReplacementsSummary {
  count: number;
  total_quantity: string;
  total_waived: string;
}

export interface ReplacementListParams extends PageParams {
  customer?: number;
  /** Границы периода. Имена канонические (`from`/`to`) — те же во всём API. */
  from?: string;
  to?: string;
}

export async function listReplacements(
  params: ReplacementListParams,
): Promise<Page<ReplacementRow>> {
  const { data } = await api.get<Page<ReplacementRow>>("/replacements", { params });
  return data;
}

export async function replacementsSummary(
  params: Omit<ReplacementListParams, "limit" | "offset">,
): Promise<ReplacementsSummary> {
  const { data } = await api.get<ReplacementsSummary>("/replacements/summary", { params });
  return data;
}

export interface CheckOut {
  check_id: number;
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
  /** Доставка-услуга: прибавляется к итогу после скидки и сама не скидывается. */
  delivery_fee: string;
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
  /** Границы периода. Имена канонические (`from`/`to`) — те же во всём API. */
  from?: string;
  to?: string;
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
  receipt_id: number;
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
  product_id: number;
  name: string;
}

export interface UnitLookup {
  unit_id: number;
  name: string;
}

export interface WarehouseLookup {
  warehouse_id: number;
  name: string;
}

/** Подбор продукта для позиции меню — только ЕДА: продавать упаковку, швабру
 *  или статью «Аренда» нельзя, а в общем списке они тонут среди продуктов. */
export async function listProductsLookup(): Promise<Page<ProductLookup>> {
  const items = await fetchAllPages<ProductLookup>((p) =>
    api
      .get<Page<ProductLookup>>("/products", { params: { ...p, item_type: "food" } })
      .then((r) => r.data));
  return { items, total: items.length, limit: items.length, offset: 0 };
}

export async function listUnitsLookup(): Promise<Page<UnitLookup>> {
  const { data } = await api.get<Page<UnitLookup>>("/units", { params: { limit: 200 } });
  return data;
}

export async function listWarehousesLookup(): Promise<Page<WarehouseLookup>> {
  const { data } = await api.get<Page<WarehouseLookup>>("/warehouses", { params: { limit: 200 } });
  return data;
}
