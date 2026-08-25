/** Наши юр. лица: компании, от имени которых идёт торговля.
 *
 *  НЕ путать с `legal_entities` из зарплатного контура: те про оформление
 *  сотрудника (официально / неофициально / ИП). Здесь — сами компании, у каждой
 *  БИН, банк и расчётный счёт. БИН и различает их: названия в жизни похожи.
 *
 *  DTO повторяют app/companies/schemas.py 1:1; деньги приходят строками. */
import { api } from "@/api/client";

export interface CompanyEntityOut {
  company_entity_id: number;
  organization_id: number;
  name: string;
  /** БИН/ИИН — 12 цифр, нормализуется сервером. */
  tax_id: string;
  address: string | null;
  bank_name: string | null;
  bank_bic: string | null;
  kbe: string | null;
  bank_account: string | null;
  /** Подставляется новым накладным и платежам. Ровно одна на организацию. */
  is_default: boolean;
  is_active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface CompanyEntityInput {
  name: string;
  tax_id: string;
  address?: string | null;
  bank_name?: string | null;
  bank_bic?: string | null;
  kbe?: string | null;
  bank_account?: string | null;
  is_default?: boolean;
  note?: string | null;
}

export type CompanyEntityUpdate = Partial<CompanyEntityInput> & {
  is_active?: boolean;
};

/** Деньги одного юр. лица: что должны мы и что должны нам. */
export interface CompanyEntityMoney {
  /** null — строка «без юр. лица»: записи, заведённые до разделения. */
  company_entity_id: number | null;
  name: string;
  tax_id: string | null;
  bank_account: string | null;
  is_default: boolean;
  is_active: boolean;
  payables_received: string;
  payables_paid: string;
  payables_balance: string;
  receivables_charged: string;
  receivables_paid: string;
  receivables_balance: string;
  /** Дебиторка минус кредиторка. */
  net_balance: string;
  suppliers_with_debt: number;
  customers_with_debt: number;
  customers_total: number;
}

export interface CompanyEntitiesMoneyReport {
  as_of: string | null;
  rows: CompanyEntityMoney[];
  total_payables: string;
  total_receivables: string;
}

export interface CustomersEntityAssignResult {
  updated: number;
  company_entity_id: number | null;
  company_entity_name: string | null;
}

const BASE = "/company-entities";

export async function listCompanyEntities(
  include_inactive = false,
): Promise<CompanyEntityOut[]> {
  const { data } = await api.get<CompanyEntityOut[]>(BASE, {
    params: include_inactive ? { include_inactive: true } : {},
  });
  return data;
}

export async function createCompanyEntity(
  body: CompanyEntityInput,
): Promise<CompanyEntityOut> {
  const { data } = await api.post<CompanyEntityOut>(BASE, body);
  return data;
}

export async function updateCompanyEntity(
  id: number,
  body: CompanyEntityUpdate,
): Promise<CompanyEntityOut> {
  const { data } = await api.patch<CompanyEntityOut>(`${BASE}/${id}`, body);
  return data;
}

/** Закрытие, а не удаление: на компанию уже ссылаются накладные и журналы. */
export async function deactivateCompanyEntity(
  id: number,
): Promise<CompanyEntityOut> {
  const { data } = await api.delete<CompanyEntityOut>(`${BASE}/${id}`);
  return data;
}

export async function reportCompanyEntities(params: {
  as_of?: string;
}): Promise<CompanyEntitiesMoneyReport> {
  const { data } = await api.get<CompanyEntitiesMoneyReport>(
    "/reports/company-entities",
    { params },
  );
  return data;
}

/** Отнести клиентов к юрлицу пачкой. `null` — снять привязку. */
export async function assignCustomersEntity(body: {
  customer_ids: number[];
  company_entity_id: number | null;
}): Promise<CustomersEntityAssignResult> {
  const { data } = await api.post<CustomersEntityAssignResult>(
    "/customers/company-entity",
    body,
  );
  return data;
}
