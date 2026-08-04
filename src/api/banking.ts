/** Banking API: банковские выписки и разнесение операций по платежам.
 *  DTO зеркалит app/banking/schemas.py 1:1 (Decimal → string).
 *
 *  Защита от двойного прогона живёт в БД на трёх уровнях, поэтому клиент не
 *  обязан ничего проверять: повторный файл вернёт 409 `statement_already_loaded`,
 *  а повторные операции просто не попадут в `imported_count`.
 */
import { api } from "@/api/client";
import type { Page, PageParams } from "@/api/client";

export type TxDirection = "debit" | "credit";
export type TxStatus = "new" | "matched" | "ignored";

export interface BankStatementOut {
  bank_statement_id: number;
  /** Наш счёт, по которому выписка. */
  account_iban: string | null;
  currency: string | null;
  owner_name: string | null;
  owner_tax_id: string | null;
  bank_name: string | null;
  period_from: string | null;
  period_to: string | null;
  opening_balance: string | null;
  closing_balance: string | null;
  debit_total: string;
  credit_total: string;
  /** Строк в файле и сколько из них новых: разница — отсечённые повторы. */
  parsed_count: number;
  imported_count: number;
  /** `входящий + кредит − дебет == исходящий` и итоги сошлись с подвалом файла.
   *  false — часть строк не разобрана, разносить платежи нельзя. */
  balance_check_ok: boolean;
  file_name: string | null;
  warnings: string | null;
  created_at: string;
}

export interface BankTransactionOut {
  bank_transaction_id: number;
  bank_statement_id: number;
  operated_at: string;
  value_date: string;
  direction: TxDirection;
  amount: string;
  doc_number: string | null;
  counterparty_name: string | null;
  /** БИН/ИИН, вытащенный из имени: по нему ищется наш контрагент. */
  counterparty_tax_id: string | null;
  counterparty_iban: string | null;
  knp: string | null;
  purpose: string | null;
  status: TxStatus;
  supplier_id: number | null;
  customer_id: number | null;
  supplier_payment_id: number | null;
  customer_payment_id: number | null;
  /** tax_id — нашли по БИН автоматически; manual — разнёс человек. */
  matched_by: string | null;
  note: string | null;
}

export interface StatementBucket {
  count: number;
  debit: string;
  credit: string;
}

export interface TransactionListParams extends PageParams {
  statement?: number;
  status?: TxStatus;
  direction?: TxDirection;
}

/** Загрузка идёт по одному файлу; повторный файл — 409. */
export async function uploadStatement(file: File): Promise<BankStatementOut> {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post<BankStatementOut>("/bank-statements", fd, {
    timeout: 120_000,
  });
  return data;
}

export async function listStatements(
  params: PageParams,
): Promise<Page<BankStatementOut>> {
  const { data } = await api.get<Page<BankStatementOut>>("/bank-statements", { params });
  return data;
}

export async function getStatement(id: number): Promise<BankStatementOut> {
  const { data } = await api.get<BankStatementOut>(`/bank-statements/${id}`);
  return data;
}

export async function statementSummary(
  id: number,
): Promise<Record<string, StatementBucket>> {
  const { data } = await api.get<Record<string, StatementBucket>>(
    `/bank-statements/${id}/summary`);
  return data;
}

export async function listTransactions(
  params: TransactionListParams,
): Promise<Page<BankTransactionOut>> {
  const { data } = await api.get<Page<BankTransactionOut>>("/bank-transactions", {
    params,
  });
  return data;
}

/** Разнести операцию: ровно одно из supplier_id / customer_id. */
export async function assignTransaction(
  id: number,
  body: { supplier_id?: number; customer_id?: number; note?: string },
): Promise<BankTransactionOut> {
  const { data } = await api.post<BankTransactionOut>(
    `/bank-transactions/${id}/assign`, body);
  return data;
}

/** Отменить разнесение: платёж сторнируется, операция возвращается в очередь. */
export async function unassignTransaction(id: number): Promise<BankTransactionOut> {
  const { data } = await api.post<BankTransactionOut>(
    `/bank-transactions/${id}/unassign`);
  return data;
}

export async function ignoreTransaction(
  id: number,
  note?: string,
): Promise<BankTransactionOut> {
  const { data } = await api.post<BankTransactionOut>(
    `/bank-transactions/${id}/ignore`, { note });
  return data;
}
