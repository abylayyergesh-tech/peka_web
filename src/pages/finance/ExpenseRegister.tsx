/** Реестр расходов: те же колонки, что в рабочем Excel, плюс выгрузка.

 *  Жёлтая строка — нет даты фактической оплаты. */
import { DownloadOutlined, PlusOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  createExpense,
  deleteExpense,
  downloadExpenseRegister,
  listExpenseCategories,
  listExpenses,
  listSuppliersRef,
  updateExpense,
  type ExpenseCreate,
  type ExpenseOut,
  type PaymentMethod,
} from "@/api/finance";
import { useCan } from "@/auth/store";
import { fmtDate, fmtMoney, Money } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import { PAYMENT_METHOD_OPTIONS, paymentMethodLabel } from "@/pages/finance/labels";
import { ReportRangePicker, useReportRange } from "@/pages/finance/reportRange";

interface ExpenseFormValues {
  expense_date: Dayjs;
  category_id: number;
  amount: number;
  payment_method?: PaymentMethod;
  supplier_id?: number;
  counterparty_name?: string;
  tax_id?: string;
  bank_account?: string;
  accepted_date?: Dayjs | null;
  paid_date?: Dayjs | null;
  note?: string;
}

export default function ExpenseRegister({
  title,
  allowEdit,
}: {
  title: string;
  allowEdit: boolean;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("finance.manage") && allowEdit;
  const { limit, offset, tablePagination, reset } = usePagination();
  const { range, setRange, params: period } = useReportRange();

  const [category, setCategory] = useState<number | undefined>();
  const [supplier, setSupplier] = useState<number | undefined>();
  const [editing, setEditing] = useState<ExpenseOut | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [form] = Form.useForm<ExpenseFormValues>();

  const categoriesQuery = useQuery({
    queryKey: ["expense-categories"],
    queryFn: () => listExpenseCategories(),
    staleTime: 60_000,
  });
  const suppliersQuery = useQuery({
    queryKey: ["suppliers-ref"],
    queryFn: () => listSuppliersRef(),
    staleTime: 60_000,
  });

  const query = useQuery({
    queryKey: ["expenses", { ...period, category, supplier, limit, offset }],
    queryFn: () =>
      listExpenses({
        from: period.from,
        to: period.to,
        category,
        supplier,
        limit,
        offset,
      }),
  });

  const save = useMutation({
    mutationFn: (body: ExpenseCreate) =>
      editing ? updateExpense(editing.expense_id, body) : createExpense(body),
    onSuccess: () => {
      message.success(editing ? "Сохранено" : "Создано");
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteExpense(id),
    onSuccess: () => {
      message.success("Расход удалён");
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openCreate() {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      expense_date: dayjs(),
      accepted_date: dayjs(),
    });
    setModalOpen(true);
  }

  function openEdit(row: ExpenseOut) {
    setEditing(row);
    form.setFieldsValue({
      expense_date: dayjs(row.expense_date),
      category_id: row.category_id,
      amount: Number(row.amount),
      payment_method: (row.payment_method as PaymentMethod) ?? undefined,
      supplier_id: row.supplier_id ?? undefined,
      counterparty_name: row.counterparty_name ?? undefined,
      tax_id: row.tax_id ?? undefined,
      bank_account: row.bank_account ?? undefined,
      accepted_date: row.accepted_date ? dayjs(row.accepted_date) : null,
      paid_date: row.paid_date ? dayjs(row.paid_date) : null,
      note: row.note ?? undefined,
    });
    setModalOpen(true);
  }

  function submit(v: ExpenseFormValues) {
    const body: ExpenseCreate = {
      expense_date: v.expense_date.format("YYYY-MM-DD"),
      category_id: v.category_id,
      amount: String(v.amount),
      note: v.note?.trim() ? v.note.trim() : null,
      supplier_id: v.supplier_id ?? null,
      counterparty_name: v.counterparty_name?.trim() || null,
      tax_id: v.tax_id?.trim() || null,
      bank_account: v.bank_account?.trim() || null,
      accepted_date: v.accepted_date ? v.accepted_date.format("YYYY-MM-DD") : null,
      paid_date: v.paid_date ? v.paid_date.format("YYYY-MM-DD") : null,
      payment_method: v.payment_method ?? null,
    };
    save.mutate(body);
  }

  async function exportXlsx() {
    setExporting(true);
    try {
      await downloadExpenseRegister({
        from: period.from,
        to: period.to,
        category,
        supplier,
      });
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  }

  const pageTotal = useMemo(
    () => (query.data?.items ?? []).reduce((acc, r) => acc + Number(r.amount), 0),
    [query.data],
  );

  const columns: ColumnsType<ExpenseOut> = [
    { title: "№", dataIndex: "expense_id", width: 80 },
    {
      title: "Дата документа",
      dataIndex: "expense_date",
      width: 130,
      render: (d: string) => fmtDate(d),
    },
    {
      title: "Контрагент",
      dataIndex: "counterparty_name",
      width: 200,
      render: (v: string | null) => v || "—",
    },
    {
      title: "БИН",
      dataIndex: "tax_id",
      width: 140,
      render: (v: string | null) => v || "—",
    },
    {
      title: "Банковский счёт",
      dataIndex: "bank_account",
      width: 180,
      render: (v: string | null) => v || "—",
    },
    {
      title: "Статья",
      dataIndex: "category_name",
      width: 180,
      render: (name: string | null, row) => name || `#${row.category_id}`,
    },
    {
      title: "Подробности",
      dataIndex: "note",
      render: (n: string | null) => n || "—",
    },
    {
      title: "Сумма в валюте",
      dataIndex: "amount",
      align: "right",
      width: 140,
      render: (v: string) => <Money value={v} />,
    },
    {
      title: "Дата акцепта",
      dataIndex: "accepted_date",
      width: 130,
      render: (d: string | null) => (d ? fmtDate(d) : "—"),
    },
    {
      title: "Дата фактической оплаты",
      dataIndex: "paid_date",
      width: 180,
      render: (d: string | null) => (d ? fmtDate(d) : "—"),
    },
    {
      title: "Оплата",
      dataIndex: "payment_method",
      width: 110,
      render: (m: string | null) => paymentMethodLabel(m),
    },
    ...(canManage
      ? [{
          title: "",
          width: 80,
          render: (_: unknown, row: ExpenseOut) => (
            <Popconfirm
              title="Удалить расход?"
              okText="Да"
              cancelText="Нет"
              onConfirm={() => remove.mutate(row.expense_id)}
            >
              <a onClick={(e) => e.stopPropagation()}>Удалить</a>
            </Popconfirm>
          ),
        } satisfies ColumnsType<ExpenseOut>[number]]
      : []),
  ];

  return (
    <div>
      <style>{`
        .expense-unpaid td { background: #fffbe6; }
      `}</style>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <Space>
          <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => void exportXlsx()}>
            Excel
          </Button>
          {canManage && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Добавить
            </Button>
          )}
        </Space>
      </Space>

      <Space wrap style={{ marginBottom: 16 }}>
        <ReportRangePicker
          value={range}
          onChange={(r) => {
            setRange(r);
            reset();
          }}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Статья"
          style={{ minWidth: 200 }}
          value={category}
          onChange={(v) => {
            setCategory(v);
            reset();
          }}
          options={(categoriesQuery.data ?? []).map((c) => ({
            value: c.expense_category_id,
            label: c.name,
          }))}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Поставщик"
          style={{ minWidth: 200 }}
          value={supplier}
          onChange={(v) => {
            setSupplier(v);
            reset();
          }}
          options={(suppliersQuery.data ?? []).map((s) => ({
            value: s.supplier_id,
            label: s.name,
          }))}
        />
      </Space>

      <Table
        rowKey="expense_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        pagination={tablePagination(query.data?.total)}
        columns={columns}
        scroll={{ x: 1600 }}
        rowClassName={(row) =>
          `${canManage ? "row-clickable" : ""} ${row.paid_date ? "" : "expense-unpaid"}`.trim()
        }
        onRow={(row) => ({
          onClick: () => canManage && openEdit(row),
        })}
        summary={() =>
          query.data?.items?.length ? (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={7}>
                <b>Итого на странице</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={7} align="right">
                <b>{fmtMoney(pageTotal)}</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={8} colSpan={canManage ? 4 : 3} />
            </Table.Summary.Row>
          ) : null
        }
      />

      <Modal
        title={editing ? "Изменить расход" : "Новый расход"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={save.isPending}
        destroyOnClose
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item
            name="expense_date"
            label="Дата документа"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <DatePicker format="DD.MM.YYYY" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="supplier_id" label="Поставщик из справочника">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Не указан"
              options={(suppliersQuery.data ?? []).map((s) => ({
                value: s.supplier_id,
                label: s.name,
              }))}
              onChange={(id) => {
                const s = suppliersQuery.data?.find((x) => x.supplier_id === id);
                if (!s) return;
                if (!form.getFieldValue("counterparty_name")) {
                  form.setFieldValue("counterparty_name", s.name);
                }
                if (!form.getFieldValue("tax_id") && s.tax_id) {
                  form.setFieldValue("tax_id", s.tax_id);
                }
              }}
            />
          </Form.Item>
          <Form.Item name="counterparty_name" label="Контрагент">
            <Input maxLength={256} placeholder="Как в платёжке" />
          </Form.Item>
          <Form.Item name="tax_id" label="БИН">
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item name="bank_account" label="Банковский счёт">
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item
            name="category_id"
            label="Статья"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Выберите статью"
              options={(categoriesQuery.data ?? []).map((c) => ({
                value: c.expense_category_id,
                label: c.is_active ? c.name : `${c.name} (неактивна)`,
              }))}
            />
          </Form.Item>
          <Form.Item name="note" label="Подробности">
            <Input.TextArea rows={2} maxLength={1000} />
          </Form.Item>
          <Form.Item
            name="amount"
            label="Сумма в валюте"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <InputNumber
              style={{ width: "100%" }}
              min={0.01}
              step={1}
              precision={2}
              decimalSeparator=","
            />
          </Form.Item>
          <Form.Item name="accepted_date" label="Дата акцепта">
            <DatePicker format="DD.MM.YYYY" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="paid_date" label="Дата фактической оплаты">
            <DatePicker format="DD.MM.YYYY" style={{ width: "100%" }} allowClear />
          </Form.Item>
          <Form.Item name="payment_method" label="Способ оплаты">
            <Select allowClear placeholder="Не указан" options={PAYMENT_METHOD_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
