/** /shifts — лента кассы: чеки и списания смены в одной таблице.
 *
 * Отдельной вкладки «Смены» больше нет: открытие смены живёт на кассе, отчёт
 * по смене — на /shifts/:id. Складские акты без shift_id сюда не входят.
 */
import { PlusOutlined } from "@ant-design/icons";
import { App, Button, DatePicker, Form, Modal, Result, Select, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  createCheck,
  listCustomers,
  listRegisterJournal,
  listShifts,
  listWarehousesLookup,
  type CheckCreate,
  type RegisterEntryOut,
  type RegisterKind,
} from "@/api/sales";
import { useCan } from "@/auth/store";
import { Money, fmtDate, fmtDateTime } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import { CheckStatusTag } from "@/pages/sales/statusTags";

const { RangePicker } = DatePicker;

function entryHref(row: RegisterEntryOut): string {
  return row.kind === "check" ? `/checks/${row.entry_id}` : `/write-offs/${row.entry_id}`;
}

function WriteOffStatusTag({ status }: { status: string }) {
  if (status === "posted") return <Tag color="green">Проведено</Tag>;
  if (status === "draft") return <Tag>Черновик</Tag>;
  return <Tag>{status}</Tag>;
}

export default function ShiftsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const canOperate = useCan("sale.operate");
  const { limit, offset, tablePagination, reset } = usePagination();
  const [searchParams, setSearchParams] = useSearchParams();
  const [shiftFilter, setShiftFilter] = useState<number | undefined>(() => {
    const raw = searchParams.get("shift");
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : undefined;
  });
  const [kindFilter, setKindFilter] = useState<RegisterKind | undefined>(undefined);
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();

  const dateFrom = range?.[0]?.format("YYYY-MM-DD");
  const dateTo = range?.[1]?.format("YYYY-MM-DD");

  const query = useQuery({
    queryKey: [
      "register-journal",
      { limit, offset, shift: shiftFilter, kind: kindFilter, dateFrom, dateTo },
    ],
    queryFn: () =>
      listRegisterJournal({
        limit,
        offset,
        shift: shiftFilter,
        kind: kindFilter,
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
      queryClient.invalidateQueries({ queryKey: ["register-journal"] });
      navigate(`/checks/${chk.check_id}`);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function applyShiftFilter(v: number | undefined) {
    setShiftFilter(v);
    const next = new URLSearchParams(searchParams);
    next.delete("tab");
    if (v == null) next.delete("shift");
    else next.set("shift", String(v));
    setSearchParams(next, { replace: true });
    reset();
  }

  const shiftLabel = (id: number, number: number | null) => {
    const s = shifts.data?.items.find((x) => x.shift_id === id);
    const n = number ?? s?.number ?? id;
    const opened = s ? ` от ${fmtDate(s.opened_at)}` : "";
    return `№${n}${opened}`;
  };

  if (!canOperate) {
    return <Result status="403" title="Недостаточно прав" subTitle="Нужно право sale.operate" />;
  }

  const columns: ColumnsType<RegisterEntryOut> = [
    {
      title: "Тип",
      dataIndex: "kind",
      width: 120,
      render: (kind: RegisterKind) =>
        kind === "check" ? <Tag color="blue">Чек</Tag> : <Tag color="orange">Списание</Tag>,
    },
    {
      title: "№",
      dataIndex: "number",
      width: 80,
      render: (v: number | null, row) => (
        <Link to={entryHref(row)}>{v ?? row.entry_id}</Link>
      ),
    },
    {
      title: "Смена",
      dataIndex: "shift_id",
      render: (id: number, row) => (
        <Link to={`/shifts/${id}`}>{shiftLabel(id, row.shift_number)}</Link>
      ),
    },
    {
      title: "Когда",
      dataIndex: "occurred_at",
      width: 150,
      render: (v: string) => fmtDateTime(v),
    },
    {
      title: "Статус",
      dataIndex: "status",
      width: 130,
      render: (status: string, row) =>
        row.kind === "check" ? (
          <CheckStatusTag status={status} />
        ) : (
          <WriteOffStatusTag status={status} />
        ),
    },
    {
      title: "Клиент / причина",
      dataIndex: "label",
      ellipsis: true,
      render: (v: string | null) => v || "—",
    },
    {
      title: "Сумма",
      dataIndex: "amount",
      align: "right",
      render: (v: string | null) => (v == null ? "—" : <Money value={v} />),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <h2 style={{ margin: 0 }}>Чеки и списания</h2>
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
          style={{ width: 260 }}
          value={shiftFilter}
          onChange={applyShiftFilter}
          options={shifts.data?.items.map((s) => ({
            value: s.shift_id,
            label: `Смена №${s.number ?? s.shift_id} от ${fmtDate(s.opened_at)}`,
          }))}
        />
        <Select
          placeholder="Тип"
          allowClear
          style={{ width: 160 }}
          value={kindFilter}
          onChange={(v) => {
            setKindFilter(v);
            reset();
          }}
          options={[
            { value: "check", label: "Чеки" },
            { value: "write_off", label: "Списания" },
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
        rowKey={(row) => `${row.kind}-${row.entry_id}`}
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        pagination={tablePagination(query.data?.total)}
        columns={columns}
        rowClassName={() => "row-clickable"}
        onRow={(row) => ({
          onClick: () => navigate(entryHref(row)),
        })}
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
