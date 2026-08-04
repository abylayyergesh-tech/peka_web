import { App, DatePicker, Form, Modal, Select, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  closeShift,
  listShifts,
  listWorkLocations,
  updateShift,
  type AttendanceShiftOut,
} from "@/api/attendance";
import { listEmployees } from "@/api/staff";
import { fmtDateTime } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import { fmtDuration, ShiftStatusTag } from "@/pages/staff/shared";

const { RangePicker } = DatePicker;

interface EditFormValues {
  work_location_id: number;
  clock_in_at: Dayjs;
  clock_out_at?: Dayjs;
}

interface CloseFormValues {
  clock_out_at: Dayjs;
}

const STATUS_OPTIONS = [
  { value: "open", label: "Открыта" },
  { value: "closed", label: "Закрыта" },
];

export default function AttendancePage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { limit, offset, tablePagination, reset } = usePagination();

  const [employeeId, setEmployeeId] = useState<number | undefined>();
  const [workLocationId, setWorkLocationId] = useState<number | undefined>();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);

  const [editing, setEditing] = useState<AttendanceShiftOut | null>(null);
  const [closing, setClosing] = useState<AttendanceShiftOut | null>(null);
  const [editForm] = Form.useForm<EditFormValues>();
  const [closeForm] = Form.useForm<CloseFormValues>();

  const from = range ? range[0].format("YYYY-MM-DD") : undefined;
  const to = range ? range[1].format("YYYY-MM-DD") : undefined;

  const query = useQuery({
    queryKey: ["shifts", { limit, offset, employeeId, workLocationId, statusFilter, from, to }],
    queryFn: () =>
      listShifts({
        limit,
        offset,
        employee_id: employeeId,
        work_location_id: workLocationId,
        status: statusFilter,
        from,
        to,
      }),
  });

  const empQuery = useQuery({
    queryKey: ["employees", "options"],
    queryFn: () => listEmployees({ limit: 200, offset: 0 }),
    staleTime: 60_000,
  });
  const empOptions =
    empQuery.data?.items.map((e) => ({ value: e.employee_id, label: e.full_name })) ?? [];

  const locQuery = useQuery({
    queryKey: ["work-locations", "options"],
    queryFn: () => listWorkLocations({ limit: 200, offset: 0, include_inactive: true }),
    staleTime: 60_000,
  });
  const locOptions =
    locQuery.data?.items.map((l) => ({ value: l.work_location_id, label: l.name })) ?? [];

  const saveEdit = useMutation({
    mutationFn: (values: EditFormValues) =>
      updateShift(editing!.attendance_shift_id, {
        work_location_id: values.work_location_id,
        clock_in_at: values.clock_in_at.toISOString(),
        clock_out_at: values.clock_out_at ? values.clock_out_at.toISOString() : null,
      }),
    onSuccess: () => {
      message.success("Смена скорректирована");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const doClose = useMutation({
    mutationFn: (values: CloseFormValues) =>
      closeShift(closing!.attendance_shift_id, { clock_out_at: values.clock_out_at.toISOString() }),
    onSuccess: () => {
      message.success("Смена закрыта");
      setClosing(null);
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openEdit(row: AttendanceShiftOut) {
    setEditing(row);
    editForm.setFieldsValue({
      work_location_id: row.work_location_id,
      clock_in_at: dayjs(row.clock_in_at),
      clock_out_at: row.clock_out_at ? dayjs(row.clock_out_at) : undefined,
    });
  }

  function openClose(row: AttendanceShiftOut) {
    setClosing(row);
    closeForm.setFieldsValue({ clock_out_at: dayjs() });
  }

  const columns: ColumnsType<AttendanceShiftOut> = [
    {
      title: "Сотрудник",
      dataIndex: "employee_name",
      render: (v, row) => v || `#${row.employee_id}`,
    },
    {
      title: "Локация",
      dataIndex: "work_location_name",
      render: (v, row) => v || `#${row.work_location_id}`,
    },
    { title: "Начало", dataIndex: "clock_in_at", render: (v) => fmtDateTime(v) },
    { title: "Конец", dataIndex: "clock_out_at", render: (v) => fmtDateTime(v) },
    {
      title: "Длительность",
      dataIndex: "worked_minutes",
      render: (v) => fmtDuration(v),
    },
    {
      title: "Статус",
      dataIndex: "status",
      width: 130,
      render: (v, row) => (
        <Space size={4}>
          <ShiftStatusTag status={v} />
          {row.is_edited && <Tag color="warning">изменена</Tag>}
        </Space>
      ),
    },
    {
      title: "",
      width: 160,
      render: (_, row) => (
        <Space size="small">
          <a onClick={() => openEdit(row)}>Изменить</a>
          {row.status === "open" && <a onClick={() => openClose(row)}>Закрыть</a>}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Табель</h2>

      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          allowClear
          placeholder="Сотрудник"
          style={{ width: 220 }}
          value={employeeId}
          onChange={(v) => {
            setEmployeeId(v);
            reset();
          }}
          options={empOptions}
          showSearch
          optionFilterProp="label"
        />
        <Select
          allowClear
          placeholder="Локация"
          style={{ width: 200 }}
          value={workLocationId}
          onChange={(v) => {
            setWorkLocationId(v);
            reset();
          }}
          options={locOptions}
          showSearch
          optionFilterProp="label"
        />
        <Select
          allowClear
          placeholder="Статус"
          style={{ width: 150 }}
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            reset();
          }}
          options={STATUS_OPTIONS}
        />
        <RangePicker
          format="DD.MM.YYYY"
          value={range}
          onChange={(v) => {
            setRange(v as [Dayjs, Dayjs] | null);
            reset();
          }}
        />
      </Space>

      <Table
        rowKey="attendance_shift_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        pagination={tablePagination(query.data?.total)}
        columns={columns}
        scroll={{ x: 900 }}
      />

      <Modal
        title="Корректировка смены"
        open={editing != null}
        onCancel={() => setEditing(null)}
        onOk={() => editForm.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={saveEdit.isPending}
        destroyOnClose
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={(v) => saveEdit.mutate(v)}
        >
          <Form.Item
            name="work_location_id"
            label="Локация"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Select options={locOptions} showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item
            name="clock_in_at"
            label="Начало смены"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <DatePicker
              showTime
              format="DD.MM.YYYY HH:mm"
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item name="clock_out_at" label="Конец смены (пусто — оставить открытой)">
            <DatePicker
              showTime
              format="DD.MM.YYYY HH:mm"
              style={{ width: "100%" }}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Закрытие смены"
        open={closing != null}
        onCancel={() => setClosing(null)}
        onOk={() => closeForm.submit()}
        okText="Закрыть смену"
        cancelText="Отмена"
        confirmLoading={doClose.isPending}
        destroyOnClose
      >
        <Form form={closeForm} layout="vertical" onFinish={(v) => doClose.mutate(v)}>
          <Form.Item
            name="clock_out_at"
            label="Время окончания"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <DatePicker
              showTime
              format="DD.MM.YYYY HH:mm"
              style={{ width: "100%" }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
