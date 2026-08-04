/** /bank-statements/:id — операции выписки и разнесение их по платежам.
 *
 * Списание разносится в оплату поставщику (кредиторка), поступление — в оплату от
 * клиента (дебиторка). Контрагент, найденный по БИН, подставлен заранее, но платёж
 * всё равно создаёт человек: цена ошибки — оплата не тому.
 */
import { CheckOutlined, StopOutlined, UndoOutlined, WarningOutlined } from "@ant-design/icons";
import {
  Alert, App, Button, Card, Col, Popconfirm, Row, Segmented, Select, Space,
  Statistic, Table, Tag, Tooltip, Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  assignTransaction, getStatement, ignoreTransaction, listTransactions,
  statementSummary, unassignTransaction,
  type BankTransactionOut, type TxStatus,
} from "@/api/banking";
import { listAllCustomers } from "@/api/sales";
import { useCan } from "@/auth/store";
import { Money, fmtDate, fmtDateTime } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import { useSupplierRefs } from "@/pages/procurement/refData";

const STATUS_LABELS: Record<TxStatus, string> = {
  new: "На разбор",
  matched: "Разнесены",
  ignored: "Закрыты",
};

export default function BankStatementDetailPage() {
  const { id } = useParams();
  const statementId = Number(id);
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("payment.manage");
  const canCustomerPay = useCan("customer_payment.manage");
  const { limit, offset, tablePagination, reset } = usePagination();
  const [status, setStatus] = useState<TxStatus>("new");
  /** Выбор контрагента до нажатия «Разнести» — по строке. */
  const [choice, setChoice] = useState<Record<number, number | undefined>>({});

  const statement = useQuery({
    queryKey: ["bank-statement", statementId],
    queryFn: () => getStatement(statementId),
    enabled: Number.isFinite(statementId),
  });

  const summary = useQuery({
    queryKey: ["bank-statement-summary", statementId],
    queryFn: () => statementSummary(statementId),
    enabled: Number.isFinite(statementId),
  });

  const txs = useQuery({
    queryKey: ["bank-transactions", { statementId, status, limit, offset }],
    queryFn: () => listTransactions({ statement: statementId, status, limit, offset }),
    enabled: Number.isFinite(statementId),
  });

  const suppliers = useSupplierRefs();
  const customers = useQuery({
    queryKey: ["customers-lookup", "banking"],
    // Постранично: `limit: 500` упирался в потолок бэкенда (le=200) и отдавал
    // 422 — список контрагентов для разноски был пуст всегда.
    queryFn: () => listAllCustomers({ active: true }),
    staleTime: 60_000,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
    queryClient.invalidateQueries({ queryKey: ["bank-statement-summary", statementId] });
    queryClient.invalidateQueries({ queryKey: ["payables"] });
  };

  const assign = useMutation({
    mutationFn: (v: { id: number; supplier_id?: number; customer_id?: number }) =>
      assignTransaction(v.id, { supplier_id: v.supplier_id, customer_id: v.customer_id }),
    onSuccess: () => {
      message.success("Платёж создан");
      refresh();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const unassign = useMutation({
    mutationFn: (txId: number) => unassignTransaction(txId),
    onSuccess: () => {
      message.success("Разнесение отменено, платёж сторнирован");
      refresh();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const ignore = useMutation({
    mutationFn: (txId: number) => ignoreTransaction(txId),
    onSuccess: () => {
      message.success("Операция закрыта");
      refresh();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const st = statement.data;
  const counterpartyOptions = (row: BankTransactionOut) =>
    row.direction === "debit"
      ? suppliers.options
      : (customers.data ?? []).map((c) => ({
          value: c.customer_id,
          label: c.name,
        }));

  const columns: ColumnsType<BankTransactionOut> = [
    {
      title: "Операция",
      key: "when",
      width: 165,
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <span>{fmtDateTime(row.operated_at)}</span>
          <span style={{ color: "#999", fontSize: 12 }}>
            №{row.doc_number ?? "—"} · КНП {row.knp ?? "—"}
          </span>
        </Space>
      ),
    },
    {
      title: "Сумма",
      dataIndex: "amount",
      width: 150,
      align: "right",
      render: (v: string, row) => (
        <Space direction="vertical" size={0} style={{ alignItems: "flex-end" }}>
          <b style={{ color: row.direction === "debit" ? "#cf1322" : "#389e0d" }}>
            <Money value={v} />
          </b>
          <span style={{ color: "#999", fontSize: 12 }}>
            {row.direction === "debit" ? "списание" : "поступление"}
          </span>
        </Space>
      ),
    },
    {
      title: "Контрагент в выписке",
      key: "counterparty",
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <span>{row.counterparty_name ?? "—"}</span>
          <span style={{ color: "#999", fontSize: 12 }}>
            {row.counterparty_tax_id ? `БИН ${row.counterparty_tax_id}` : "БИН не указан"}
            {row.counterparty_iban ? ` · ${row.counterparty_iban}` : ""}
          </span>
          {row.purpose && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis>
              {row.purpose}
            </Typography.Text>
          )}
        </Space>
      ),
    },
    {
      title: status === "new" ? "Кому разнести" : "Разнесено",
      key: "assign",
      width: 330,
      render: (_, row) => {
        if (row.status === "matched") {
          const to =
            row.supplier_id != null ? (
              <Link to={`/suppliers/${row.supplier_id}`}>поставщик #{row.supplier_id}</Link>
            ) : (
              <Link to={`/customers/${row.customer_id}`}>клиент #{row.customer_id}</Link>
            );
          return (
            <Space size={6}>
              <Tag color="green" icon={<CheckOutlined />}>
                платёж создан
              </Tag>
              {to}
            </Space>
          );
        }
        if (row.status === "ignored") {
          return (
            <Tooltip title={row.note ?? undefined}>
              <Tag>закрыта</Tag>
            </Tooltip>
          );
        }
        const preselected = row.supplier_id ?? row.customer_id ?? undefined;
        const value = choice[row.bank_transaction_id] ?? preselected;
        const needsCustomerRight = row.direction === "credit" && !canCustomerPay;
        return (
          <Space.Compact style={{ width: "100%" }}>
            <Select
              showSearch
              optionFilterProp="label"
              style={{ width: "100%" }}
              placeholder={row.direction === "debit" ? "Поставщик" : "Клиент"}
              value={value}
              disabled={!canManage || needsCustomerRight}
              loading={row.direction === "debit" ? suppliers.isPending : customers.isPending}
              onChange={(v) =>
                setChoice((prev) => ({ ...prev, [row.bank_transaction_id]: v }))
              }
              options={counterpartyOptions(row)}
            />
            <Tooltip
              title={
                needsCustomerRight
                  ? "Нужно право на платежи клиентов"
                  : !st?.balance_check_ok
                    ? "Итоги выписки не сходятся — разносить нельзя"
                    : undefined
              }
            >
              <Button
                type="primary"
                icon={<CheckOutlined />}
                disabled={
                  !canManage || value == null || needsCustomerRight || !st?.balance_check_ok
                }
                loading={assign.isPending}
                onClick={() =>
                  assign.mutate(
                    row.direction === "debit"
                      ? { id: row.bank_transaction_id, supplier_id: value }
                      : { id: row.bank_transaction_id, customer_id: value },
                  )
                }
              />
            </Tooltip>
          </Space.Compact>
        );
      },
    },
    {
      title: "",
      key: "actions",
      width: 130,
      render: (_, row) =>
        canManage && (
          <Space>
            {row.status === "matched" && (
              <Popconfirm
                title="Отменить разнесение?"
                description="Платёж будет сторнирован (отмена останется в журнале)."
                okText="Да"
                cancelText="Нет"
                onConfirm={() => unassign.mutate(row.bank_transaction_id)}
              >
                <Button size="small" icon={<UndoOutlined />} />
              </Popconfirm>
            )}
            {row.status === "new" && (
              <Tooltip title="Не наша операция: комиссия, зарплата, перевод между счетами">
                <Button
                  size="small"
                  icon={<StopOutlined />}
                  onClick={() => ignore.mutate(row.bank_transaction_id)}
                />
              </Tooltip>
            )}
          </Space>
        ),
    },
  ];

  const bucket = (key: TxStatus) => summary.data?.[key];

  return (
    <div>
      <Space style={{ marginBottom: 8 }} wrap>
        <Link to="/bank-statements">← Выписки</Link>
        <h2 style={{ margin: 0 }}>{st?.account_iban ?? "Выписка"}</h2>
        {st?.period_from && st?.period_to && (
          <Tag>
            {fmtDate(st.period_from)} — {fmtDate(st.period_to)}
          </Tag>
        )}
        {st && !st.balance_check_ok && (
          <Tag color="red" icon={<WarningOutlined />}>
            итоги не сходятся
          </Tag>
        )}
      </Space>

      {st && !st.balance_check_ok && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="Итоги выписки не сходятся — разнесение заблокировано"
          description={
            st.warnings ??
            "Входящий + поступления − списания не равно исходящему остатку: часть строк файла могла не разобраться."
          }
        />
      )}

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small" loading={summary.isPending}>
            <Statistic title="На разбор" value={bucket("new")?.count ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" loading={summary.isPending}>
            <Statistic title="Разнесено" value={bucket("matched")?.count ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" loading={statement.isPending}>
            <Statistic title="Списано всего" value={st?.debit_total ?? "0"} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" loading={statement.isPending}>
            <Statistic title="Поступило всего" value={st?.credit_total ?? "0"} />
          </Card>
        </Col>
      </Row>

      <Segmented
        style={{ marginBottom: 12 }}
        value={status}
        onChange={(v) => {
          setStatus(v as TxStatus);
          reset();
        }}
        options={(["new", "matched", "ignored"] as TxStatus[]).map((s) => ({
          value: s,
          label: `${STATUS_LABELS[s]} (${summary.data?.[s]?.count ?? 0})`,
        }))}
      />

      <Table
        rowKey="bank_transaction_id"
        size="small"
        loading={txs.isPending}
        dataSource={txs.data?.items}
        pagination={tablePagination(txs.data?.total)}
        columns={columns}
        locale={{ emptyText: "Операций в этой группе нет" }}
      />
    </div>
  );
}
