/** Табель смен — лист «Табель» рабочего шаблона: сетка месяц × сменщики,
 * значение клетки = смены за день (0,5 / 1 / 1,5 / 2).
 *
 * Клетки правятся прямо в сетке: изменения копятся локально и уходят на бэкенд
 * одним запросом по кнопке «Сохранить» — иначе на 91 сотруднике × 31 день
 * получилось бы под три тысячи запросов. Цвет значения показывает источник:
 * автосбор из отметок attendance, ручная правка или согласованный перерасчёт. */
import { DownloadOutlined, PlusOutlined, ReloadOutlined, SaveOutlined } from "@ant-design/icons";
import {
  App,
  Alert,
  Button,
  Form,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  closeTimesheet,
  createTimesheet,
  downloadPayrollWorkbook,
  getTimesheetGrid,
  listTimesheets,
  rebuildTimesheet,
  reopenTimesheet,
  setTimesheetDays,
  updateTimesheet,
  type TimesheetDayIn,
  type TimesheetRowOut,
} from "@/api/payroll";
import { useCan } from "@/auth/store";
import {
  MONTH_OPTIONS,
  ShiftCell,
  TimesheetStatusTag,
  fmtShifts,
  periodLabel,
} from "@/pages/payroll/shared";

/** Ключ незакоммиченной правки: "<employee_id>:<day>". */
type DraftKey = string;

const SHIFT_STEPS = [0, 0.5, 1, 1.5, 2];

export default function TimesheetPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("payroll.manage");
  const [timesheetId, setTimesheetId] = useState<number | undefined>();
  const [draft, setDraft] = useState<Record<DraftKey, number>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm<{
    period_year: number;
    period_month: number;
    advance_cutoff_day: number;
  }>();

  const timesheets = useQuery({
    queryKey: ["timesheets"],
    queryFn: () => listTimesheets({ limit: 100, offset: 0 }),
  });

  // Первый доступный табель выбирается сам — иначе страница открывается пустой.
  const effectiveId = timesheetId ?? timesheets.data?.items[0]?.timesheet_id;

  const grid = useQuery({
    queryKey: ["timesheet-grid", effectiveId],
    queryFn: () => getTimesheetGrid(effectiveId!),
    enabled: effectiveId != null,
  });

  const days = grid.data?.days_in_month ?? 31;
  const cutoff = grid.data?.timesheet.advance_cutoff_day ?? 15;
  const isClosed = grid.data?.timesheet.status === "closed";
  const dirtyCount = Object.keys(draft).length;

  const create = useMutation({
    mutationFn: createTimesheet,
    onSuccess: (ts) => {
      message.success("Табель создан");
      setCreateOpen(false);
      setTimesheetId(ts.timesheet_id);
      queryClient.invalidateQueries({ queryKey: ["timesheets"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const saveDays = useMutation({
    mutationFn: () => {
      const payload: TimesheetDayIn[] = Object.entries(draft).map(([key, shifts]) => {
        const [employeeId, day] = key.split(":");
        return { employee_id: Number(employeeId), day: Number(day), shifts: String(shifts) };
      });
      return setTimesheetDays(effectiveId!, payload);
    },
    onSuccess: () => {
      message.success(`Сохранено клеток: ${dirtyCount}`);
      setDraft({});
      queryClient.invalidateQueries({ queryKey: ["timesheet-grid", effectiveId] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const rebuild = useMutation({
    mutationFn: (overwriteManual: boolean) => rebuildTimesheet(effectiveId!, overwriteManual),
    onSuccess: (r) => {
      message.success(
        `Собрано из отметок: клеток ${r.days_written}, сотрудников ${r.employees_touched}` +
          (r.days_skipped_manual ? `, сохранено правок ${r.days_skipped_manual}` : ""),
      );
      setDraft({});
      queryClient.invalidateQueries({ queryKey: ["timesheet-grid", effectiveId] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const changeCutoff = useMutation({
    mutationFn: (day: number) => updateTimesheet(effectiveId!, { advance_cutoff_day: day }),
    onSuccess: () => {
      message.success("Отсечка аванса изменена");
      queryClient.invalidateQueries({ queryKey: ["timesheet-grid", effectiveId] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const toggleClosed = useMutation({
    mutationFn: () => (isClosed ? reopenTimesheet(effectiveId!) : closeTimesheet(effectiveId!)),
    onSuccess: () => {
      message.success(isClosed ? "Табель открыт" : "Табель закрыт");
      queryClient.invalidateQueries({ queryKey: ["timesheet-grid", effectiveId] });
      queryClient.invalidateQueries({ queryKey: ["timesheets"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const download = useMutation({
    mutationFn: () => {
      const ts = grid.data!.timesheet;
      return downloadPayrollWorkbook(
        ts.timesheet_id,
        `zp_${ts.period_year}_${String(ts.period_month).padStart(2, "0")}.xlsx`,
      );
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function cellValue(row: TimesheetRowOut, day: number): number {
    const key = `${row.employee_id}:${day}`;
    if (key in draft) return draft[key];
    return Number(row.days[String(day)] ?? 0);
  }

  /** Клик по клетке двигает значение по кругу 0 → 0,5 → 1 → 1,5 → 2 → 0:
   * так табель заполняется мышью, без ввода чисел. */
  function bumpCell(row: TimesheetRowOut, day: number) {
    if (!canManage || isClosed) return;
    const current = cellValue(row, day);
    const idx = SHIFT_STEPS.indexOf(current);
    const next = SHIFT_STEPS[(idx < 0 ? 0 : idx + 1) % SHIFT_STEPS.length];
    setDraft((prev) => ({ ...prev, [`${row.employee_id}:${day}`]: next }));
  }

  /** Итоги пересчитываются локально, чтобы правки было видно до сохранения. */
  function rowTotals(row: TimesheetRowOut): { advance: number; month: number } {
    let advance = 0;
    let month = 0;
    for (let d = 1; d <= days; d += 1) {
      const v = cellValue(row, d);
      month += v;
      if (d <= cutoff) advance += v;
    }
    return { advance, month };
  }

  const columns: ColumnsType<TimesheetRowOut> = useMemo(() => {
    const dayColumns: ColumnsType<TimesheetRowOut> = Array.from({ length: days }, (_, i) => {
      const day = i + 1;
      return {
        title: String(day),
        key: `d${day}`,
        width: 38,
        align: "center" as const,
        // Отсечка аванса — видимая граница, как вертикальная линия в шаблоне.
        onHeaderCell: () =>
          day === cutoff ? { style: { borderRight: "2px solid #8c8c8c" } } : {},
        onCell: () => (day === cutoff ? { style: { borderRight: "2px solid #8c8c8c" } } : {}),
        render: (_: unknown, row: TimesheetRowOut) => {
          const key = `${row.employee_id}:${day}`;
          const value = cellValue(row, day);
          const isDraft = key in draft;
          return (
            <div
              onClick={() => bumpCell(row, day)}
              style={{
                cursor: canManage && !isClosed ? "pointer" : "default",
                background: isDraft ? "#fffbe6" : undefined,
                minHeight: 20,
              }}
            >
              <ShiftCell
                value={value === 0 ? undefined : String(value)}
                source={isDraft ? "manual" : row.sources[String(day)]}
              />
            </div>
          );
        },
      };
    });
    return [
      {
        title: "ФИО",
        dataIndex: "employee_name",
        width: 230,
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
      ...dayColumns,
      {
        title: `Смен на аванс (1—${cutoff})`,
        key: "advance",
        width: 100,
        align: "right",
        fixed: "right",
        render: (_: unknown, row) => <b>{fmtShifts(rowTotals(row).advance)}</b>,
      },
      {
        title: "Смен за месяц",
        key: "month",
        width: 100,
        align: "right",
        fixed: "right",
        render: (_: unknown, row) => <b>{fmtShifts(rowTotals(row).month)}</b>,
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, cutoff, draft, canManage, isClosed]);

  const now = new Date();

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <h2 style={{ margin: 0 }}>Табель смен</h2>
        <Space>
          {canManage && (
            <Button
              icon={<PlusOutlined />}
              onClick={() => {
                createForm.setFieldsValue({
                  period_year: now.getFullYear(),
                  period_month: now.getMonth() + 1,
                  advance_cutoff_day: 15,
                });
                setCreateOpen(true);
              }}
            >
              Новый месяц
            </Button>
          )}
          <Button
            icon={<DownloadOutlined />}
            disabled={effectiveId == null}
            loading={download.isPending}
            onClick={() => download.mutate()}
          >
            Выгрузить Excel
          </Button>
        </Space>
      </Space>

      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          style={{ width: 220 }}
          placeholder="Период"
          value={effectiveId}
          onChange={(v) => {
            setTimesheetId(v);
            setDraft({});
          }}
          options={(timesheets.data?.items ?? []).map((t) => ({
            value: t.timesheet_id,
            label: periodLabel(t.period_year, t.period_month),
          }))}
        />
        {grid.data && <TimesheetStatusTag status={grid.data.timesheet.status} />}
        {grid.data && (
          <Space size={4}>
            <span>Аванс за дни с 1 по:</span>
            <InputNumber
              min={1}
              max={days}
              value={cutoff}
              disabled={!canManage || isClosed}
              onChange={(v) => v && changeCutoff.mutate(v)}
              style={{ width: 70 }}
            />
          </Space>
        )}
        {canManage && !isClosed && effectiveId != null && (
          <Popconfirm
            title="Собрать табель из отметок?"
            description={
              <div style={{ maxWidth: 320 }}>
                Каждая закрытая смена даст 1 за свой день. Ручные правки и
                согласованные перерасчёты сохранятся.
              </div>
            }
            okText="Собрать"
            cancelText="Отмена"
            onConfirm={() => rebuild.mutate(false)}
          >
            <Button icon={<ReloadOutlined />} loading={rebuild.isPending}>
              Собрать из отметок
            </Button>
          </Popconfirm>
        )}
        {canManage && effectiveId != null && (
          <Popconfirm
            title={isClosed ? "Открыть табель?" : "Закрыть табель?"}
            description={
              isClosed
                ? "Нельзя, если по табелю уже есть проведённая ведомость."
                : "Закрытый табель нельзя править — только согласованным перерасчётом."
            }
            okText={isClosed ? "Открыть" : "Закрыть"}
            cancelText="Отмена"
            onConfirm={() => toggleClosed.mutate()}
          >
            <Button loading={toggleClosed.isPending}>{isClosed ? "Открыть" : "Закрыть"}</Button>
          </Popconfirm>
        )}
        {canManage && dirtyCount > 0 && (
          <>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saveDays.isPending}
              onClick={() => saveDays.mutate()}
            >
              Сохранить ({dirtyCount})
            </Button>
            <Button onClick={() => setDraft({})}>Отменить правки</Button>
          </>
        )}
      </Space>

      {timesheets.data?.items.length === 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Табелей ещё нет"
          description="Создайте месяц кнопкой «Новый месяц», затем соберите смены из отметок или заполните сетку вручную."
        />
      )}

      {isClosed && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Табель закрыт — править клетки нельзя. Исправить закрытый месяц можно заявлением на перерасчёт табеля."
        />
      )}

      {grid.data && (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
          В табеле только сменщики — окладникам он не нужен, их оплата от смен не
          зависит. Клик по клетке меняет значение: 0 → 0,5 → 1 → 1,5 → 2.{" "}
          <span style={{ color: "#1677ff" }}>Синее</span> — автосбор из отметок,{" "}
          <span style={{ color: "#d48806" }}>жёлтое</span> — правка вручную,{" "}
          <span style={{ color: "#c41d7f" }}>розовое</span> — согласованный перерасчёт.
        </Typography.Paragraph>
      )}

      <Table
        rowKey="employee_id"
        size="small"
        bordered
        loading={grid.isLoading}
        dataSource={grid.data?.rows ?? []}
        columns={columns}
        scroll={{ x: 1800, y: 600 }}
        pagination={false}
      />

      <Modal
        open={createOpen}
        title="Новый табель"
        okText="Создать"
        cancelText="Отмена"
        confirmLoading={create.isPending}
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
        destroyOnClose
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={(v) =>
            create.mutate({
              period_year: v.period_year,
              period_month: v.period_month,
              advance_cutoff_day: v.advance_cutoff_day,
            })
          }
        >
          <Form.Item name="period_year" label="Год" rules={[{ required: true }]}>
            <InputNumber min={2000} max={2100} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="period_month" label="Месяц" rules={[{ required: true }]}>
            <Select options={MONTH_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="advance_cutoff_day"
            label="Аванс за дни с 1 по"
            rules={[{ required: true }]}
            extra="Обычно 15 или 21"
          >
            <InputNumber min={1} max={31} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
