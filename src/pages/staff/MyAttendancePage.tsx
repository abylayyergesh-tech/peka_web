import {
  App,
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Empty,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  clockIn,
  clockOut,
  getMyOpenShift,
  listMyShifts,
  listWorkLocations,
  type AttendanceShiftOut,
} from "@/api/attendance";
import { fmtDateTime } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import { fmtDuration, getPosition, ShiftStatusTag } from "@/pages/staff/shared";

const { RangePicker } = DatePicker;

export default function MyAttendancePage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { limit, offset, tablePagination, reset } = usePagination();

  const [clockInOpen, setClockInOpen] = useState(false);
  const [clockInLoc, setClockInLoc] = useState<number | undefined>();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);

  const from = range ? range[0].format("YYYY-MM-DD") : undefined;
  const to = range ? range[1].format("YYYY-MM-DD") : undefined;

  const openShift = useQuery({
    queryKey: ["my-open-shift"],
    queryFn: () => getMyOpenShift(),
    retry: false,
  });

  const history = useQuery({
    queryKey: ["my-shifts", { limit, offset, from, to }],
    queryFn: () => listMyShifts({ limit, offset, from, to }),
  });

  const locQuery = useQuery({
    queryKey: ["work-locations", "my-options"],
    queryFn: () => listWorkLocations({ limit: 200, offset: 0 }),
    staleTime: 60_000,
    enabled: clockInOpen,
  });
  const locOptions =
    locQuery.data?.items.map((l) => ({ value: l.id, label: l.name })) ?? [];

  function afterClock() {
    queryClient.invalidateQueries({ queryKey: ["my-open-shift"] });
    queryClient.invalidateQueries({ queryKey: ["my-shifts"] });
  }

  const clockInM = useMutation({
    mutationFn: async (workLocationId: number) => {
      const pos = await getPosition();
      return clockIn({ work_location_id: workLocationId, ...pos });
    },
    onSuccess: () => {
      message.success("Смена начата");
      setClockInOpen(false);
      setClockInLoc(undefined);
      afterClock();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const clockOutM = useMutation({
    mutationFn: async () => {
      const pos = await getPosition();
      return clockOut(pos);
    },
    onSuccess: () => {
      message.success("Смена завершена");
      afterClock();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const shift = openShift.data;

  const columns: ColumnsType<AttendanceShiftOut> = [
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
      width: 120,
      render: (v) => <ShiftStatusTag status={v} />,
    },
  ];

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Моя смена</h2>

      <Card size="small" loading={openShift.isPending} style={{ marginBottom: 24 }}>
        {shift ? (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Локация">
                {shift.work_location_name || `#${shift.work_location_id}`}
              </Descriptions.Item>
              <Descriptions.Item label="Начало">
                {fmtDateTime(shift.clock_in_at)}
              </Descriptions.Item>
              <Descriptions.Item label="В работе">
                {fmtDuration(dayjs().diff(dayjs(shift.clock_in_at), "minute"))}
              </Descriptions.Item>
            </Descriptions>
            <Popconfirm
              title="Завершить текущую смену?"
              okText="Завершить"
              cancelText="Отмена"
              okButtonProps={{ loading: clockOutM.isPending }}
              onConfirm={() => clockOutM.mutate()}
            >
              <Button type="primary" danger loading={clockOutM.isPending}>
                Завершить смену
              </Button>
            </Popconfirm>
          </Space>
        ) : (
          <Empty description="Смена не открыта">
            <Button type="primary" onClick={() => setClockInOpen(true)}>
              Начать смену
            </Button>
          </Empty>
        )}
      </Card>

      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <h3 style={{ margin: 0 }}>История смен</h3>
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
        rowKey="id"
        size="small"
        loading={history.isPending}
        dataSource={history.data?.items}
        pagination={tablePagination(history.data?.total)}
        columns={columns}
        scroll={{ x: 700 }}
      />

      <Modal
        title="Начать смену"
        open={clockInOpen}
        onCancel={() => setClockInOpen(false)}
        onOk={() => clockInLoc != null && clockInM.mutate(clockInLoc)}
        okText="Начать"
        cancelText="Отмена"
        okButtonProps={{ disabled: clockInLoc == null }}
        confirmLoading={clockInM.isPending}
        destroyOnClose
      >
        {locQuery.isError ? (
          <Alert
            type="warning"
            showIcon
            message="Не удалось загрузить список рабочих локаций. Обратитесь к администратору."
          />
        ) : (
          <Space direction="vertical" style={{ width: "100%" }}>
            <Select
              placeholder="Выберите локацию"
              style={{ width: "100%" }}
              value={clockInLoc}
              onChange={setClockInLoc}
              options={locOptions}
              loading={locQuery.isPending}
              showSearch
              optionFilterProp="label"
            />
            <Alert
              type="info"
              showIcon
              message="При старте смены запрашивается геопозиция устройства (нужно разрешить доступ)."
            />
          </Space>
        )}
      </Modal>
    </div>
  );
}
