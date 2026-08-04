/** Ведомость целиком — листы «Аванс» и «Зарплата» рабочего шаблона.
 *
 * Жёлтые колонки правятся на месте (InputNumber в ячейке): бэкенд после каждой
 * правки пересчитывает зависимые суммы, поэтому строка обновляется сразу — как
 * пересчёт формул в Excel. Остальные колонки расчётные.
 *
 * Жизненный цикл: черновик → утверждена → проведена. Проведение регистрирует
 * переводы в реестре выплат (и, если задана статья, зеркалит расход). */
import { ArrowLeftOutlined, DownloadOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  App,
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Form,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  approvePayrollRun,
  calculatePayrollRun,
  downloadPayrollWorkbook,
  getPayrollRun,
  payPayrollRun,
  updatePayrollRunLine,
  type PayrollRunLineOut,
  type PayrollRunLineUpdate,
} from "@/api/payroll";
import { listActiveExpenseCategories } from "@/api/requests";
import { useCan } from "@/auth/store";
import {
  PAY_TYPE_LABELS,
  PayoutMethodTag,
  RUN_KIND_LABELS,
  RunStatusTag,
  SignedMoney,
  WarningTag,
  fmtShifts,
  fmtTenge,
  periodLabel,
} from "@/pages/payroll/shared";

/** Ячейка ручного ввода: правка уходит на бэкенд по blur/Enter. */
function EditableCell({
  value,
  disabled,
  onCommit,
}: {
  value: string | null;
  disabled: boolean;
  onCommit: (next: number) => void;
}) {
  const committed = value == null ? 0 : Number(value);
  const [local, setLocal] = useState<number | null>(value == null ? null : Number(value));
  // Бэкенд после правки пересчитывает зависимые суммы, поэтому пришедшее с
  // сервера значение может отличаться от введённого (например «Выдано факт»
  // подтягивается к «К выплате»). Table переиспользует инстанс ячейки, так что
  // без синхронизации в поле осталось бы устаревшее локальное значение.
  useEffect(() => {
    setLocal(value == null ? null : Number(value));
  }, [value]);
  return (
    <InputNumber
      size="small"
      min={0}
      step={1000}
      disabled={disabled}
      value={local}
      controls={false}
      style={{ width: "100%", background: disabled ? undefined : "#fffbe6" }}
      formatter={(v) => (v == null || String(v) === "" ? "" : Number(v).toLocaleString("ru-RU"))}
      parser={(v) => Number((v ?? "").replace(/\s/g, "").replace(/,/g, "."))}
      onChange={(v) => setLocal(v)}
      onBlur={() => {
        const next = local ?? 0;
        if (next !== committed) onCommit(next);
      }}
      onPressEnter={() => {
        const next = local ?? 0;
        if (next !== committed) onCommit(next);
      }}
    />
  );
}

export default function PayrollRunDetailPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("payroll.manage");
  const { id } = useParams<{ id: string }>();
  const runId = Number(id);
  const [payOpen, setPayOpen] = useState(false);
  const [payForm] = Form.useForm<{ payout_date: dayjs.Dayjs; expense_category_id?: number }>();

  const query = useQuery({
    queryKey: ["payroll-run", runId],
    queryFn: () => getPayrollRun(runId),
    enabled: Number.isFinite(runId),
  });

  const run = query.data?.run;
  const lines = query.data?.lines ?? [];
  const totals = query.data?.totals;
  const isAdvance = run?.kind === "advance";
  const locked = run?.status === "paid";
  const editable = canManage && !locked;

  const categories = useQuery({
    queryKey: ["expense-categories"],
    queryFn: listActiveExpenseCategories,
    staleTime: 60_000,
    enabled: payOpen,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["payroll-run", runId] });
    queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
  };

  const editLine = useMutation({
    mutationFn: ({ lineId, body }: { lineId: number; body: PayrollRunLineUpdate }) =>
      updatePayrollRunLine(runId, lineId, body),
    onSuccess: () => invalidate(),
    onError: (e) => message.error(errorMessage(e)),
  });

  const recalc = useMutation({
    mutationFn: () => calculatePayrollRun(runId),
    onSuccess: () => {
      message.success("Пересчитано");
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const approve = useMutation({
    mutationFn: () => approvePayrollRun(runId),
    onSuccess: () => {
      message.success("Ведомость утверждена");
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const pay = useMutation({
    mutationFn: (values: { payout_date: dayjs.Dayjs; expense_category_id?: number }) =>
      payPayrollRun(runId, {
        payout_date: values.payout_date ? values.payout_date.format("YYYY-MM-DD") : null,
        expense_category_id: values.expense_category_id ?? null,
      }),
    onSuccess: () => {
      message.success("Ведомость проведена, выплаты зарегистрированы");
      setPayOpen(false);
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["payroll-payments"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const download = useMutation({
    mutationFn: () =>
      downloadPayrollWorkbook(
        run!.timesheet_id,
        `zp_${run!.period_year}_${String(run!.period_month).padStart(2, "0")}.xlsx`,
      ),
    onError: (e) => message.error(errorMessage(e)),
  });

  function commit(line: PayrollRunLineOut, field: keyof PayrollRunLineUpdate) {
    return (next: number) =>
      editLine.mutate({ lineId: line.payroll_run_line_id, body: { [field]: String(next) } });
  }

  const commonColumns: ColumnsType<PayrollRunLineOut> = [
    { title: "№", dataIndex: "row_no", width: 46, fixed: "left" },
    {
      title: "ФИО",
      dataIndex: "employee_name",
      width: 220,
      fixed: "left",
      render: (v: string, row) => (
        <Space direction="vertical" size={0}>
          <span>{v}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.department_name ?? "—"} · {row.position ?? "—"}
          </Typography.Text>
        </Space>
      ),
    },
    { title: "Оформление", dataIndex: "legal_entity_name", width: 130, render: (v) => v || "—" },
    {
      title: "Тип",
      dataIndex: "pay_type",
      width: 80,
      render: (v: "shift" | "salary") => PAY_TYPE_LABELS[v],
    },
    {
      title: "Ставка / оклад",
      dataIndex: "rate_amount",
      width: 110,
      align: "right",
      render: (v: string) => fmtTenge(v),
    },
    {
      title: "Офиц. часть",
      dataIndex: "official_amount",
      width: 110,
      align: "right",
      render: (v: string) => (Number(v) > 0 ? fmtTenge(v) : "—"),
    },
    {
      title: isAdvance ? "Смены (период)" : "Смены за месяц",
      dataIndex: "shifts",
      width: 100,
      align: "right",
      render: (v: string | null) => fmtShifts(v),
    },
    {
      title: "Начислено",
      dataIndex: "accrued",
      width: 110,
      align: "right",
      render: (v: string) => fmtTenge(v),
    },
  ];

  const advanceColumns: ColumnsType<PayrollRunLineOut> = [
    ...commonColumns,
    {
      title: "Лимит аванса",
      dataIndex: "advance_limit",
      width: 110,
      align: "right",
      render: (v: string | null) => fmtTenge(v),
    },
    {
      title: "Еда под зп",
      dataIndex: "meal_deduction",
      width: 110,
      align: "right",
      render: (v: string, row) => (
        <EditableCell value={v} disabled={!editable} onCommit={commit(row, "meal_deduction")} />
      ),
    },
    {
      title: "Ранее выдано",
      dataIndex: "previously_paid",
      width: 110,
      align: "right",
      render: (v: string, row) => (
        <EditableCell value={v} disabled={!editable} onCommit={commit(row, "previously_paid")} />
      ),
    },
    {
      title: "Доступно",
      dataIndex: "available",
      width: 110,
      align: "right",
      render: (v: string | null) => fmtTenge(v),
    },
    {
      title: "Запрос",
      dataIndex: "requested",
      width: 110,
      align: "right",
      render: (v: string, row) => (
        <EditableCell value={v} disabled={!editable} onCommit={commit(row, "requested")} />
      ),
    },
    {
      title: "Разница",
      dataIndex: "difference",
      width: 100,
      align: "right",
      // Отрицательная разница = запрос урезан до доступного лимита.
      render: (v: string | null) => <SignedMoney value={v} />,
    },
    {
      title: "К ВЫПЛАТЕ",
      dataIndex: "to_pay",
      width: 120,
      align: "right",
      render: (v: string | null) => <b>{fmtTenge(v)}</b>,
    },
    {
      title: "Способ",
      dataIndex: "payout_method",
      width: 110,
      render: (v: PayrollRunLineOut["payout_method"]) => <PayoutMethodTag method={v} />,
    },
    {
      title: "Выдано факт",
      dataIndex: "paid_fact",
      width: 120,
      align: "right",
      render: (v: string | null, row) => (
        <EditableCell value={v} disabled={!editable} onCommit={commit(row, "paid_fact")} />
      ),
    },
  ];

  const salaryColumns: ColumnsType<PayrollRunLineOut> = [
    ...commonColumns,
    {
      title: "Премии",
      dataIndex: "bonus",
      width: 110,
      align: "right",
      render: (v: string, row) => (
        <EditableCell value={v} disabled={!editable} onCommit={commit(row, "bonus")} />
      ),
    },
    {
      title: "Итого начислено",
      dataIndex: "total_accrued",
      width: 120,
      align: "right",
      render: (v: string | null) => fmtTenge(v),
    },
    {
      title: "Еда за месяц",
      dataIndex: "meal_deduction",
      width: 110,
      align: "right",
      render: (v: string, row) => (
        <EditableCell value={v} disabled={!editable} onCommit={commit(row, "meal_deduction")} />
      ),
    },
    {
      title: "Фин. займы",
      dataIndex: "loan_deduction",
      width: 110,
      align: "right",
      render: (v: string, row) => (
        <EditableCell value={v} disabled={!editable} onCommit={commit(row, "loan_deduction")} />
      ),
    },
    {
      title: "Штрафы",
      dataIndex: "penalty",
      width: 110,
      align: "right",
      render: (v: string, row) => (
        <EditableCell value={v} disabled={!editable} onCommit={commit(row, "penalty")} />
      ),
    },
    {
      title: "Аванс (карта)",
      dataIndex: "advance_card",
      width: 110,
      align: "right",
      render: (v: string) => fmtTenge(v),
    },
    {
      title: "Аванс (нал.)",
      dataIndex: "advance_cash",
      width: 110,
      align: "right",
      render: (v: string) => fmtTenge(v),
    },
    {
      title: "К ВЫПЛАТЕ",
      dataIndex: "total_to_pay",
      width: 120,
      align: "right",
      render: (v: string | null) => (
        <b>
          <SignedMoney value={v} />
        </b>
      ),
    },
    {
      title: "На карту",
      dataIndex: "to_card",
      width: 110,
      align: "right",
      render: (v: string | null) => fmtTenge(v),
    },
    {
      title: "Наличными",
      dataIndex: "to_cash",
      width: 110,
      align: "right",
      // Отрицательные наличные = сотрудник получил авансом больше, чем заработал.
      render: (v: string | null) => <SignedMoney value={v} />,
    },
    {
      title: "Пометка",
      dataIndex: "warning",
      width: 220,
      render: (v: string | null) => <WarningTag warning={v} />,
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <Space>
          <Link to="/payroll/runs">
            <Button icon={<ArrowLeftOutlined />} />
          </Link>
          <h2 style={{ margin: 0 }}>
            {run ? `${RUN_KIND_LABELS[run.kind]} — ${periodLabel(run.period_year, run.period_month)}` : "Ведомость"}
          </h2>
          {run && <RunStatusTag status={run.status} />}
        </Space>
        <Space>
          {editable && (
            <Button icon={<ReloadOutlined />} loading={recalc.isPending} onClick={() => recalc.mutate()}>
              Пересчитать
            </Button>
          )}
          {canManage && run?.status === "draft" && (
            <Popconfirm
              title="Утвердить ведомость?"
              description="После утверждения её можно провести — зарегистрировать выплаты."
              okText="Утвердить"
              cancelText="Отмена"
              onConfirm={() => approve.mutate()}
            >
              <Button type="primary" loading={approve.isPending}>
                Утвердить
              </Button>
            </Popconfirm>
          )}
          {canManage && run?.status === "approved" && (
            <Button
              type="primary"
              onClick={() => {
                payForm.setFieldsValue({ payout_date: dayjs() });
                setPayOpen(true);
              }}
            >
              Провести и выплатить
            </Button>
          )}
          <Button
            icon={<DownloadOutlined />}
            disabled={run == null}
            loading={download.isPending}
            onClick={() => download.mutate()}
          >
            Выгрузить Excel
          </Button>
        </Space>
      </Space>

      {locked && (
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
          message="Ведомость проведена — правки закрыты, выплаты зарегистрированы в реестре."
        />
      )}

      {totals && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          {isAdvance ? (
            <>
              <Col>
                <Card size="small">
                  <Statistic title="Начислено" value={fmtTenge(totals.accrued)} />
                </Card>
              </Col>
              <Col>
                <Card size="small">
                  <Statistic title="Запрошено" value={fmtTenge(totals.requested)} />
                </Card>
              </Col>
              <Col>
                <Card size="small">
                  <Statistic title="К выплате" value={fmtTenge(totals.to_pay)} />
                </Card>
              </Col>
              <Col>
                <Card size="small">
                  <Statistic title="Выдано факт" value={fmtTenge(totals.paid_fact)} />
                </Card>
              </Col>
            </>
          ) : (
            <>
              <Col>
                <Card size="small">
                  <Statistic title="Итого начислено" value={fmtTenge(totals.total_accrued)} />
                </Card>
              </Col>
              <Col>
                <Card size="small">
                  <Statistic title="Удержано займов" value={fmtTenge(totals.loan_deduction)} />
                </Card>
              </Col>
              <Col>
                <Card size="small">
                  <Statistic title="К выплате" value={fmtTenge(totals.total_to_pay)} />
                </Card>
              </Col>
              <Col>
                <Card size="small">
                  <Statistic title="На карту" value={fmtTenge(totals.to_card)} />
                </Card>
              </Col>
              <Col>
                <Card size="small">
                  <Statistic title="Наличными" value={fmtTenge(totals.to_cash)} />
                </Card>
              </Col>
            </>
          )}
        </Row>
      )}

      {totals && Object.keys(totals.by_legal_entity).length > 0 && (
        <Card size="small" title="Сводка «на карту» по юрлицам" style={{ marginBottom: 16 }}>
          <Descriptions
            size="small"
            column={3}
            items={Object.entries(totals.by_legal_entity).map(([name, value]) => ({
              key: name,
              label: name,
              children: fmtTenge(value),
            }))}
          />
          {Number(totals.meal_ip) > 0 && (
            <Typography.Text type="secondary">
              Справочно: еда под зп по расчётам через ИП — {fmtTenge(totals.meal_ip)} ₸
            </Typography.Text>
          )}
        </Card>
      )}

      {editable && (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
          Жёлтые поля заполняются вручную; после ввода зависимые суммы пересчитываются
          сразу. Расчёты через ИП в ведомости не считаются.
        </Typography.Paragraph>
      )}

      <Table
        rowKey="payroll_run_line_id"
        size="small"
        bordered
        loading={query.isLoading}
        dataSource={lines}
        columns={isAdvance ? advanceColumns : salaryColumns}
        scroll={{ x: 2200, y: 600 }}
        pagination={false}
        rowClassName={(row) => (row.legal_entity_kind === "ip" ? "payroll-row-ip" : "")}
      />

      <Modal
        open={payOpen}
        title="Провести ведомость"
        okText="Провести"
        cancelText="Отмена"
        confirmLoading={pay.isPending}
        onCancel={() => setPayOpen(false)}
        onOk={() => payForm.submit()}
        destroyOnClose
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Действие необратимо"
          description={
            isAdvance
              ? "По каждой строке с «Выдано факт» > 0 будет создана запись в реестре выплат. Правки после проведения закрыты."
              : "По каждой строке будут созданы записи «на карту» и «наличными». Отрицательные наличные (долг сотрудника) перевода не порождают. Займы месяца помечаются удержанными."
          }
        />
        <Form form={payForm} layout="vertical" onFinish={(v) => pay.mutate(v)}>
          <Form.Item name="payout_date" label="Дата выплаты" rules={[{ required: true }]}>
            <DatePicker format="DD.MM.YYYY" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="expense_category_id"
            label="Статья расходов (необязательно)"
            extra="Если указать — итог ведомости зеркалится одной строкой в расходы"
          >
            <Select
              allowClear
              loading={categories.isLoading}
              showSearch
              optionFilterProp="label"
              options={(categories.data ?? []).map((c) => ({
                value: c.expense_category_id,
                label: c.name,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
