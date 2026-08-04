/** /shifts — cash shifts: open-shift card(s) + open/close actions + history table. */
import { PlusOutlined } from "@ant-design/icons";
import {
  App, Button, Card, Descriptions, DatePicker, Empty, Form, InputNumber, Modal,
  Popconfirm, Select, Space, Table,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  closeShift, listShifts, listWarehousesLookup, openShift,
  type ShiftOpen, type ShiftOut,
} from "@/api/sales";
import { useCan } from "@/auth/store";
import { Money, fmtDateTime } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import { ShiftStatusTag } from "@/pages/sales/statusTags";

const { RangePicker } = DatePicker;

export default function ShiftsTab() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const canOperate = useCan("sale.operate");
  const { limit, offset, tablePagination, reset } = usePagination();
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [warehouseFilter, setWarehouseFilter] = useState<number | undefined>(undefined);
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [openModal, setOpenModal] = useState(false);
  const [form] = Form.useForm();

  const dateFrom = range?.[0]?.format("YYYY-MM-DD");
  const dateTo = range?.[1]?.format("YYYY-MM-DD");

  const openShifts = useQuery({
    queryKey: ["shifts", "open-now"],
    queryFn: () => listShifts({ status: "open", limit: 20 }),
  });

  const history = useQuery({
    queryKey: [
      "shifts",
      { limit, offset, status: statusFilter, warehouse: warehouseFilter, dateFrom, dateTo },
    ],
    queryFn: () =>
      listShifts({
        limit,
        offset,
        status: statusFilter,
        warehouse: warehouseFilter,
        date_from: dateFrom,
        date_to: dateTo,
      }),
  });

  const warehouses = useQuery({
    queryKey: ["warehouses-lookup"],
    queryFn: listWarehousesLookup,
    staleTime: 60_000,
  });

  const doOpen = useMutation({
    mutationFn: (values: ShiftOpen) => openShift(values),
    onSuccess: (s) => {
      message.success(`Смена №${s.number ?? s.shift_id} открыта`);
      setOpenModal(false);
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const doClose = useMutation({
    mutationFn: (id: number) => closeShift(id),
    onSuccess: (report) => {
      message.success("Смена закрыта");
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      navigate(`/shifts/${report.shift.shift_id}`);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const warehouseName = (id: number) =>
    warehouses.data?.items.find((w) => w.warehouse_id === id)?.name ?? `#${id}`;

  const columns: ColumnsType<ShiftOut> = [
    {
      title: "№",
      dataIndex: "number",
      width: 80,
      render: (v: number | null, row) => <Link to={`/shifts/${row.shift_id}`}>{v ?? row.shift_id}</Link>,
    },
    { title: "Склад", dataIndex: "warehouse_id", render: (v: number) => warehouseName(v) },
    {
      title: "Статус",
      dataIndex: "status",
      width: 110,
      render: (v: string) => <ShiftStatusTag status={v} />,
    },
    { title: "Открыта", dataIndex: "opened_at", render: (v: string) => fmtDateTime(v) },
    {
      title: "Закрыта",
      dataIndex: "closed_at",
      render: (v: string | null) => fmtDateTime(v),
    },
    {
      title: "Разменный фонд",
      dataIndex: "opening_float",
      align: "right",
      render: (v: string) => <Money value={v} />,
    },
    {
      title: "",
      width: 100,
      render: (_, row) => <Link to={`/shifts/${row.shift_id}`}>Отчёт</Link>,
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "flex-end", width: "100%" }}>
        {canOperate && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpenModal(true)}>
            Открыть смену
          </Button>
        )}
      </Space>

      <Card
        title="Текущая смена"
        size="small"
        style={{ marginBottom: 16 }}
        loading={openShifts.isPending}
      >
        {openShifts.data && openShifts.data.items.length === 0 && (
          <Empty description="Нет открытых смен" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
        <Space direction="vertical" style={{ width: "100%" }} size={12}>
          {openShifts.data?.items.map((s) => (
            <Card key={s.shift_id} type="inner" title={`Смена №${s.number ?? s.shift_id}`}
              extra={<ShiftStatusTag status={s.status} />}>
              <Descriptions size="small" column={3}>
                <Descriptions.Item label="Склад">{warehouseName(s.warehouse_id)}</Descriptions.Item>
                <Descriptions.Item label="Открыта">{fmtDateTime(s.opened_at)}</Descriptions.Item>
                <Descriptions.Item label="Разменный фонд">
                  <Money value={s.opening_float} />
                </Descriptions.Item>
              </Descriptions>
              <Space style={{ marginTop: 8 }}>
                <Button onClick={() => navigate(`/shifts/${s.shift_id}`)}>Отчёт по смене</Button>
                {canOperate && (
                  <Popconfirm
                    title="Закрыть смену?"
                    description="Все чеки смены должны быть закрыты или аннулированы."
                    okText="Закрыть"
                    cancelText="Отмена"
                    onConfirm={() => doClose.mutate(s.shift_id)}
                  >
                    <Button danger loading={doClose.isPending}>
                      Закрыть смену
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            </Card>
          ))}
        </Space>
      </Card>

      <Space style={{ marginBottom: 12 }} wrap>
        <Select
          placeholder="Статус"
          allowClear
          style={{ width: 140 }}
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            reset();
          }}
          options={[
            { value: "open", label: "Открыта" },
            { value: "closed", label: "Закрыта" },
          ]}
        />
        <Select
          placeholder="Склад"
          allowClear
          showSearch
          optionFilterProp="label"
          style={{ width: 200 }}
          value={warehouseFilter}
          onChange={(v) => {
            setWarehouseFilter(v);
            reset();
          }}
          options={warehouses.data?.items.map((w) => ({ value: w.warehouse_id, label: w.name }))}
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
        rowKey="shift_id"
        size="small"
        loading={history.isPending}
        dataSource={history.data?.items}
        pagination={tablePagination(history.data?.total)}
        columns={columns}
      />

      <Modal
        title="Открыть смену"
        open={openModal}
        onCancel={() => setOpenModal(false)}
        onOk={() => form.submit()}
        okText="Открыть"
        cancelText="Отмена"
        confirmLoading={doOpen.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => doOpen.mutate(v)}>
          <Form.Item
            name="warehouse_id"
            label="Склад"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              loading={warehouses.isPending}
              options={warehouses.data?.items.map((w) => ({ value: w.warehouse_id, label: w.name }))}
            />
          </Form.Item>
          <Form.Item name="opening_float" label="Разменный фонд" initialValue={0}>
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
