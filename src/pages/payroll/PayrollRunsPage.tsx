/** Список ведомостей: по каждому табелю может быть аванс (середина месяца) и
 * зарплата (конец месяца). Создание сразу считает строки. */
import { PlusOutlined } from "@ant-design/icons";
import { App, Button, Form, InputNumber, Modal, Select, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  createPayrollRun,
  listPayrollRuns,
  listTimesheets,
  type PayrollRunOut,
  type RunKind,
  type RunStatus,
} from "@/api/payroll";
import { useCan } from "@/auth/store";
import { fmtDate, fmtDateTime } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import {
  RUN_KIND_LABELS,
  RUN_KIND_OPTIONS,
  RUN_STATUS_OPTIONS,
  RunStatusTag,
  periodLabel,
} from "@/pages/payroll/shared";

export default function PayrollRunsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("payroll.manage");
  const { limit, offset, tablePagination, reset } = usePagination(20);
  const [kind, setKind] = useState<RunKind | undefined>();
  const [status, setStatus] = useState<RunStatus | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm<{
    timesheet_id: number;
    kind: RunKind;
    advance_percent: number;
  }>();

  const query = useQuery({
    queryKey: ["payroll-runs", { limit, offset, kind, status }],
    queryFn: () => listPayrollRuns({ limit, offset, kind, status }),
  });

  const timesheets = useQuery({
    queryKey: ["timesheets"],
    queryFn: () => listTimesheets({ limit: 100, offset: 0 }),
    staleTime: 60_000,
  });

  const create = useMutation({
    mutationFn: (values: { timesheet_id: number; kind: RunKind; advance_percent: number }) =>
      createPayrollRun({
        timesheet_id: values.timesheet_id,
        kind: values.kind,
        // % аванса имеет смысл только для авансовой ведомости.
        advance_percent:
          values.kind === "advance" ? String((values.advance_percent ?? 50) / 100) : undefined,
      }),
    onSuccess: () => {
      message.success("Ведомость создана и рассчитана");
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const columns: ColumnsType<PayrollRunOut> = [
    {
      title: "Период",
      key: "period",
      width: 160,
      render: (_, row) => (
        <Link to={`/payroll/runs/${row.payroll_run_id}`}>
          {periodLabel(row.period_year, row.period_month)}
        </Link>
      ),
    },
    {
      title: "Вид",
      dataIndex: "kind",
      width: 110,
      render: (v: RunKind) => <Tag color={v === "advance" ? "orange" : "blue"}>{RUN_KIND_LABELS[v]}</Tag>,
    },
    { title: "Статус", dataIndex: "status", width: 120, render: (v: RunStatus) => <RunStatusTag status={v} /> },
    {
      title: "% аванса",
      dataIndex: "advance_percent",
      width: 100,
      align: "right",
      render: (v: string, row) => (row.kind === "advance" ? `${Math.round(Number(v) * 100)}%` : "—"),
    },
    { title: "Дата выплаты", dataIndex: "payout_date", width: 130, render: fmtDate },
    { title: "Рассчитана", dataIndex: "calculated_at", width: 150, render: fmtDateTime },
    { title: "Проведена", dataIndex: "paid_at", width: 150, render: fmtDateTime },
    {
      title: "Расход",
      dataIndex: "expense_id",
      width: 110,
      render: (v: number | null) => (v == null ? "—" : `#${v}`),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <h2 style={{ margin: 0 }}>Ведомости</h2>
        {canManage && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.setFieldsValue({ kind: "advance", advance_percent: 50 });
              setCreateOpen(true);
            }}
          >
            Новая ведомость
          </Button>
        )}
      </Space>

      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          allowClear
          placeholder="Вид"
          style={{ width: 150 }}
          value={kind}
          onChange={(v) => {
            setKind(v);
            reset();
          }}
          options={RUN_KIND_OPTIONS}
        />
        <Select
          allowClear
          placeholder="Статус"
          style={{ width: 150 }}
          value={status}
          onChange={(v) => {
            setStatus(v);
            reset();
          }}
          options={RUN_STATUS_OPTIONS}
        />
      </Space>

      <Table
        rowKey="payroll_run_id"
        size="small"
        loading={query.isLoading}
        dataSource={query.data?.items ?? []}
        columns={columns}
        pagination={tablePagination(query.data?.total)}
      />

      <Modal
        open={createOpen}
        title="Новая ведомость"
        okText="Создать и рассчитать"
        cancelText="Отмена"
        confirmLoading={create.isPending}
        onCancel={() => setCreateOpen(false)}
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => create.mutate(v)}>
          <Form.Item name="timesheet_id" label="Табель (период)" rules={[{ required: true }]}>
            <Select
              options={(timesheets.data?.items ?? []).map((t) => ({
                value: t.timesheet_id,
                label: periodLabel(t.period_year, t.period_month),
              }))}
            />
          </Form.Item>
          <Form.Item name="kind" label="Вид" rules={[{ required: true }]}>
            <Select options={RUN_KIND_OPTIONS} />
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, next) => prev.kind !== next.kind}
          >
            {({ getFieldValue }) =>
              getFieldValue("kind") === "advance" ? (
                <Form.Item
                  name="advance_percent"
                  label="% аванса"
                  extra="Доля от «ставка × смены за период»; у официально оформленных не выше официальной части"
                >
                  <InputNumber min={0} max={100} addonAfter="%" style={{ width: "100%" }} />
                </Form.Item>
              ) : null
            }
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
