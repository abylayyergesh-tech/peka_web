import { PlusOutlined } from "@ant-design/icons";
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
  listExpenseCategories,
  listExpenses,
  listSuppliersRef,
  updateExpense,
  type ExpenseCreate,
  type ExpenseOut,
  type PaymentMethod,
} from "@/api/finance";
import { useCan } from "@/auth/store";
import { fmtDate, Money } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import { PAYMENT_METHOD_OPTIONS, paymentMethodLabel } from "@/pages/finance/labels";

interface ExpenseFormValues {
  expense_date: Dayjs;
  category_id: number;
  amount: number;
  payment_method?: PaymentMethod;
  supplier_id?: number;
  note?: string;
}

export default function ExpensesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("finance.manage");
  const { limit, offset, tablePagination, reset } = usePagination();

  const [category, setCategory] = useState<number | undefined>();
  const [supplier, setSupplier] = useState<number | undefined>();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);

  const [editing, setEditing] = useState<ExpenseOut | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<ExpenseFormValues>();

  const from = range?.[0]?.format("YYYY-MM-DD");
  const to = range?.[1]?.format("YYYY-MM-DD");

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

  const categoryName = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of categoriesQuery.data ?? []) m.set(c.id, c.name);
    return m;
  }, [categoriesQuery.data]);
  const supplierName = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of suppliersQuery.data ?? []) m.set(s.id, s.name);
    return m;
  }, [suppliersQuery.data]);

  const query = useQuery({
    queryKey: ["expenses", { from, to, category, supplier, limit, offset }],
    queryFn: () => listExpenses({ from, to, category, supplier, limit, offset }),
  });

  const save = useMutation({
    mutationFn: (body: ExpenseCreate) =>
      editing ? updateExpense(editing.id, body) : createExpense(body),
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
    form.setFieldsValue({ expense_date: dayjs() });
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
      payment_method: v.payment_method ?? null,
    };
    save.mutate(body);
  }

  const columns: ColumnsType<ExpenseOut> = [
    { title: "Дата", dataIndex: "expense_date", width: 120, render: (d: string) => fmtDate(d) },
    {
      title: "Статья",
      dataIndex: "category_id",
      render: (id: number) => categoryName.get(id) ?? `#${id}`,
    },
    {
      title: "Сумма",
      dataIndex: "amount",
      align: "right",
      width: 140,
      render: (v: string) => <Money value={v} />,
    },
    {
      title: "Способ оплаты",
      dataIndex: "payment_method",
      width: 130,
      render: (m: string | null) => paymentMethodLabel(m),
    },
    {
      title: "Поставщик",
      dataIndex: "supplier_id",
      render: (id: number | null) => (id == null ? "—" : supplierName.get(id) ?? `#${id}`),
    },
    { title: "Описание", dataIndex: "note", render: (n: string | null) => n || "—" },
    {
      title: "",
      width: 150,
      render: (_, row) =>
        canManage && (
          <Space>
            <a onClick={() => openEdit(row)}>Изменить</a>
            <Popconfirm
              title="Удалить расход?"
              okText="Да"
              cancelText="Нет"
              onConfirm={() => remove.mutate(row.id)}
            >
              <a>Удалить</a>
            </Popconfirm>
          </Space>
        ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <h2 style={{ margin: 0 }}>Расходы</h2>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Добавить
          </Button>
        )}
      </Space>

      <Space wrap style={{ marginBottom: 16 }}>
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
          options={(categoriesQuery.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
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
          options={(suppliersQuery.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
        />
        <DatePicker.RangePicker
          value={range}
          format="DD.MM.YYYY"
          placeholder={["Дата с", "Дата по"]}
          onChange={(v) => {
            setRange(v && v[0] && v[1] ? [v[0], v[1]] : null);
            reset();
          }}
        />
      </Space>

      <Table
        rowKey="id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        pagination={tablePagination(query.data?.total)}
        columns={columns}
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
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item
            name="expense_date"
            label="Дата"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <DatePicker format="DD.MM.YYYY" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="category_id"
            label="Статья расходов"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Выберите статью"
              options={(categoriesQuery.data ?? []).map((c) => ({
                value: c.id,
                label: c.is_active ? c.name : `${c.name} (неактивна)`,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="amount"
            label="Сумма"
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
          <Form.Item name="payment_method" label="Способ оплаты">
            <Select allowClear placeholder="Не указан" options={PAYMENT_METHOD_OPTIONS} />
          </Form.Item>
          <Form.Item name="supplier_id" label="Поставщик">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Не указан"
              options={(suppliersQuery.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
            />
          </Form.Item>
          <Form.Item name="note" label="Описание">
            <Input.TextArea rows={2} maxLength={1000} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
