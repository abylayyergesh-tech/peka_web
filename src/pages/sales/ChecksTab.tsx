/** /checks — check list with filters (shift, status, dates) + "new check" modal. */
import { PlusOutlined } from "@ant-design/icons";
import { App, Button, DatePicker, Form, Modal, Result, Select, Space, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  createCheck, listChecks, listCustomers, listShifts, listWarehousesLookup,
  type CheckCreate, type CheckOut,
} from "@/api/sales";
import { useCan } from "@/auth/store";
import { Money, fmtDate } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import { CheckStatusTag, paymentMethodLabel } from "@/pages/sales/statusTags";

const { RangePicker } = DatePicker;

export default function ChecksTab() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const canOperate = useCan("sale.operate");
  const { limit, offset, tablePagination, reset } = usePagination();
  const [searchParams] = useSearchParams();
  const [shiftFilter, setShiftFilter] = useState<number | undefined>(() => {
    const raw = searchParams.get("shift");
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : undefined;
  });
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();

  const dateFrom = range?.[0]?.format("YYYY-MM-DD");
  const dateTo = range?.[1]?.format("YYYY-MM-DD");

  const query = useQuery({
    queryKey: [
      "checks",
      { limit, offset, shift: shiftFilter, status: statusFilter, dateFrom, dateTo },
    ],
    queryFn: () =>
      listChecks({
        limit,
        offset,
        shift: shiftFilter,
        status: statusFilter,
        from: dateFrom,
        to: dateTo,
      }),
    enabled: canOperate,
  });

  const shifts = useQuery({
    queryKey: ["shifts-lookup"],
    queryFn: () => listShifts({ limit: 200 }),
    staleTime: 60_000,
  });

  const customers = useQuery({
    queryKey: ["customers-lookup"],
    queryFn: () => listCustomers({ active: true, limit: 200 }),
    staleTime: 60_000,
  });

  const warehouses = useQuery({
    queryKey: ["warehouses-lookup"],
    queryFn: listWarehousesLookup,
    staleTime: 60_000,
  });

  const create = useMutation({
    mutationFn: (values: CheckCreate) => createCheck(values),
    onSuccess: (chk) => {
      message.success(`Чек №${chk.number ?? chk.check_id} создан`);
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ["checks"] });
      navigate(`/checks/${chk.check_id}`);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const shiftLabel = (id: number) => {
    const s = shifts.data?.items.find((x) => x.shift_id === id);
    return s ? `№${s.number ?? s.shift_id} от ${fmtDate(s.opened_at)}` : `#${id}`;
  };
  const customerName = (id: number | null) =>
    id == null ? "—" : customers.data?.items.find((c) => c.customer_id === id)?.name ?? `#${id}`;

  if (!canOperate) {
    return <Result status="403" title="Недостаточно прав" subTitle="Нужно право sale.operate" />;
  }

  const columns: ColumnsType<CheckOut> = [
    {
      title: "№",
      dataIndex: "number",
      width: 80,
      render: (v: number | null, row) => <Link to={`/checks/${row.check_id}`}>{v ?? row.check_id}</Link>,
    },
    { title: "Смена", dataIndex: "shift_id", render: (v: number) => shiftLabel(v) },
    {
      title: "Статус",
      dataIndex: "status",
      width: 120,
      render: (v: string) => <CheckStatusTag status={v} />,
    },
    { title: "Клиент", dataIndex: "customer_id", render: (v: number | null) => customerName(v) },
    { title: "Позиций", width: 90, render: (_, row) => row.lines.length },
    {
      title: "Сумма",
      dataIndex: "total",
      align: "right",
      render: (v: string) => <Money value={v} />,
    },
    {
      title: "Оплата",
      dataIndex: "payment_method",
      width: 110,
      render: (v: string | null) => paymentMethodLabel(v),
    },
    {
      title: "",
      width: 90,
      render: (_, row) => <Link to={`/checks/${row.check_id}`}>Открыть</Link>,
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "flex-end", width: "100%" }}>
        {canOperate && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            Новый чек
          </Button>
        )}
      </Space>
      <Space style={{ marginBottom: 12 }} wrap>
        <Select
          placeholder="Смена"
          allowClear
          showSearch
          optionFilterProp="label"
          style={{ width: 220 }}
          value={shiftFilter}
          onChange={(v) => {
            setShiftFilter(v);
            reset();
          }}
          options={shifts.data?.items.map((s) => ({
            value: s.shift_id,
            label: `Смена №${s.number ?? s.shift_id} от ${fmtDate(s.opened_at)}`,
          }))}
        />
        <Select
          placeholder="Статус"
          allowClear
          style={{ width: 150 }}
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            reset();
          }}
          options={[
            { value: "open", label: "Открыт" },
            { value: "paid", label: "Оплачен" },
            { value: "voided", label: "Аннулирован" },
          ]}
        />
        <RangePicker
          value={range}
          onChange={(v) => {
            setRange(v);
            reset();
          }}
        />
      </Space>
      <Table
        rowKey="check_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        pagination={tablePagination(query.data?.total)}
        columns={columns}
      />
      <Modal
        title="Новый чек"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => form.submit()}
        okText="Создать"
        cancelText="Отмена"
        confirmLoading={create.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => create.mutate(v)}>
          <Form.Item
            name="warehouse_id"
            label="Склад (нужна открытая смена)"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              loading={warehouses.isPending}
              options={warehouses.data?.items.map((w) => ({ value: w.warehouse_id, label: w.name }))}
            />
          </Form.Item>
          <Form.Item name="customer_id" label="Клиент">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              loading={customers.isPending}
              options={customers.data?.items.map((c) => ({ value: c.customer_id, label: c.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
