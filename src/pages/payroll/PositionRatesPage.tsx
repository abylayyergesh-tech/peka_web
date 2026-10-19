/** «Ставки по должностям» (ТЗ, экран «Ставки»; BACKEND_TASKS.md §10): ставка за
 * смену по должности — дневная и ночная — с датой начала действия. По ним
 * приложение показывает сотруднику «сколько выходит за месяц». Ведомость
 * по-прежнему считается из «Справочника ставок» (карточек оплаты). */
import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import {
  Alert, App, Button, DatePicker, Form, InputNumber, Modal, Popconfirm, Space, Switch, Table,
  Tag, Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  deletePositionRate,
  listPositionRates,
  setPositionRate,
  type PositionRate,
  type PositionRatesRow,
} from "@/api/earnings";
import { useCan } from "@/auth/store";
import { fmtDate } from "@/components/format";
import { fmtTenge } from "@/pages/payroll/shared";

interface FormValues {
  day_rate: number;
  night_rate: number;
  effective_from: Dayjs;
}

function RateText({ rate }: { rate: PositionRate | null }) {
  if (!rate) return <Typography.Text type="secondary">не задана</Typography.Text>;
  return (
    <span>
      {fmtTenge(rate.day_rate)} / {fmtTenge(rate.night_rate)} ₸
    </span>
  );
}

export default function PositionRatesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("payroll.manage");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<PositionRatesRow | null>(null);
  const [form] = Form.useForm<FormValues>();

  const query = useQuery({ queryKey: ["position-rates"], queryFn: listPositionRates });
  const rows = useMemo(
    () => (query.data ?? []).filter((r) => showInactive || r.is_active || r.current),
    [query.data, showInactive],
  );
  const missing = (query.data ?? []).filter((r) => r.is_active && r.employees > 0 && !r.current);

  const save = useMutation({
    mutationFn: (v: FormValues) =>
      setPositionRate(editing!.position_id, {
        day_rate: v.day_rate,
        night_rate: v.night_rate,
        effective_from: v.effective_from.format("YYYY-MM-DD"),
      }),
    onSuccess: () => {
      message.success("Ставка сохранена");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["position-rates"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: deletePositionRate,
    onSuccess: () => {
      message.success("Строка удалена");
      queryClient.invalidateQueries({ queryKey: ["position-rates"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openEdit(row: PositionRatesRow) {
    setEditing(row);
    form.setFieldsValue({
      day_rate: Number(row.current?.day_rate ?? 0),
      night_rate: Number(row.current?.night_rate ?? row.current?.day_rate ?? 0),
      effective_from: dayjs().startOf("month"),
    });
  }

  const columns: ColumnsType<PositionRatesRow> = [
    {
      title: "Должность",
      dataIndex: "position_name",
      render: (name: string, r) => (
        <Space size={4}>
          {name}
          {!r.is_active && <Tag>не используется</Tag>}
        </Space>
      ),
    },
    { title: "Сотрудников", dataIndex: "employees", width: 120, align: "right" },
    {
      title: "Ставка за смену: день / ночь",
      render: (_v, r) => <RateText rate={r.current} />,
    },
    {
      title: "Действует с",
      width: 130,
      render: (_v, r) => (r.current ? fmtDate(r.current.effective_from) : "—"),
    },
    {
      title: "Запланировано",
      render: (_v, r) =>
        r.upcoming ? (
          <span>
            с {fmtDate(r.upcoming.effective_from)}: <RateText rate={r.upcoming} />
          </span>
        ) : (
          "—"
        ),
    },
    ...(canManage
      ? [
          {
            title: "",
            width: 140,
            render: (_v: unknown, r: PositionRatesRow) => (
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>
                Задать ставку
              </Button>
            ),
          },
        ]
      : []),
  ];

  const historyColumns: ColumnsType<PositionRate> = [
    { title: "С даты", dataIndex: "effective_from", render: (d: string) => fmtDate(d) },
    { title: "День", dataIndex: "day_rate", align: "right", render: (v: string) => fmtTenge(v) },
    { title: "Ночь", dataIndex: "night_rate", align: "right", render: (v: string) => fmtTenge(v) },
    ...(canManage
      ? [
          {
            title: "",
            width: 60,
            render: (_v: unknown, r: PositionRate) => (
              <Popconfirm
                title="Удалить строку истории?"
                description="Смены этих дат посчитаются по предыдущей ставке."
                okText="Удалить"
                cancelText="Отмена"
                onConfirm={() => remove.mutate(r.position_rate_id)}
              >
                <Button size="small" type="text" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      <Space style={{ width: "100%", justifyContent: "space-between", marginBottom: 12 }} wrap>
        <h2 style={{ margin: 0 }}>Ставки по должностям</h2>
        <Space>
          <Switch size="small" checked={showInactive} onChange={setShowInactive} />
          <span>Показать неиспользуемые должности</span>
        </Space>
      </Space>
      <Typography.Paragraph type="secondary">
        По этим ставкам приложение показывает сотруднику предварительные начисления за месяц:
        отработанные дневные и ночные смены × ставка. Нет ставки должности — берётся ставка
        из «Справочника ставок». Ведомость считается по-прежнему из «Справочника ставок».
      </Typography.Paragraph>
      {missing.length > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message={`Без ставки: ${missing.map((m) => m.position_name).join(", ")}`}
        />
      )}
      <Table
        rowKey="position_id"
        size="small"
        loading={query.isPending}
        dataSource={rows}
        columns={columns}
        pagination={false}
        expandable={{
          rowExpandable: (r) => r.history.length > 0,
          expandedRowRender: (r) => (
            <Table
              rowKey="position_rate_id"
              size="small"
              dataSource={r.history}
              columns={historyColumns}
              pagination={false}
              style={{ maxWidth: 520 }}
            />
          ),
        }}
      />
      <Modal
        open={editing != null}
        title={editing ? `Ставка: ${editing.position_name}` : ""}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={save.isPending}
        onOk={() => form.submit()}
        onCancel={() => setEditing(null)}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Form.Item name="day_rate" label="Дневная смена" rules={[{ required: true }]}>
            <InputNumber min={0} step={500} addonAfter="₸" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="night_rate" label="Ночная смена" rules={[{ required: true }]}
            extra="Ночная — смена через полночь (например, 20:00–08:00)">
            <InputNumber min={0} step={500} addonAfter="₸" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="effective_from" label="Действует с" rules={[{ required: true }]}
            extra="Та же дата — правка строки, другая — новая строка истории">
            <DatePicker format="DD.MM.YYYY" style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
