/** Плановый график: кто в какой день должен выйти. Это не табель.
 *
 * Табель — факт (отметки, отпуска, ручная правка). Здесь HR рисует план.
 * Пустая клетка = день не назначен = человек свободен принять чужую смену.
 * Заявление «Обмен смены» читает именно эту сетку.
 *
 * Клетка с шаблоном смены («Дневная 08:00–20:00») задаёт время: от него
 * приложение открывает «Приход», считает опоздание, ранний уход, переработку
 * и неявку. Месяц быстро заполняется по циклу: 5/2, 2/2, сутки через трое.
 */
import { CalendarOutlined, SaveOutlined } from "@ant-design/icons";
import {
  App,
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Dropdown,
  Form,
  InputNumber,
  Modal,
  Radio,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { MenuProps } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { listShiftTemplates, listWorkLocations, type ShiftTemplateOut } from "@/api/attendance";
import { errorMessage } from "@/api/client";
import {
  getEmployeeSchedule,
  listDepartments,
  replaceScheduleDays,
  type LeaveKind,
  type ScheduleDayPut,
  type ScheduleKind,
  type ScheduleRowOut,
} from "@/api/staff";
import { useCan } from "@/auth/store";
import { useUnsavedChanges } from "@/components/useUnsavedChanges";
import { MONTH_OPTIONS, fmtShifts, periodLabel } from "@/pages/payroll/shared";
import { hhmm } from "@/pages/staff/shared";

type DraftKey = string;

interface DraftCell {
  kind: ScheduleKind | null;
  shifts: number;
  shift_template_id?: number | null;
  work_location_id?: number | null;
}

type Cycle = "5/2" | "2/2" | "1/3" | "custom";

interface FillValues {
  employee_ids: number[];
  range: [Dayjs, Dayjs];
  cycle: Cycle;
  work_days: number;
  off_days: number;
  first_work_day: Dayjs;
  shift_template_id: number;
  mark_dayoff: boolean;
}

/** Короткая метка шаблона в клетке шириной 38 px: первые буквы названия. */
function tplShort(tpl: ShiftTemplateOut | undefined): string {
  if (!tpl) return "?";
  return tpl.name.trim().slice(0, 2);
}

/** Рабочий ли день ``d`` по циклу. */
function isWorkDay(d: Dayjs, v: FillValues): boolean {
  if (v.cycle === "5/2") {
    const wd = d.day();
    return wd >= 1 && wd <= 5;
  }
  const [work, off] =
    v.cycle === "2/2" ? [2, 2] : v.cycle === "1/3" ? [1, 3] : [v.work_days, v.off_days];
  const period = work + off;
  const shift = d.startOf("day").diff(v.first_work_day.startOf("day"), "day");
  const pos = ((shift % period) + period) % period;
  return pos < work;
}

const SHIFT_STEPS = [1, 1.5, 2, 0.5];

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function cellOf(
  row: ScheduleRowOut,
  day: number,
  draft: Record<DraftKey, DraftCell>,
): DraftCell {
  const key = `${row.employee_id}:${day}`;
  if (key in draft) return draft[key];
  const saved = row.days[String(day)];
  return {
    kind: saved?.kind ?? null,
    shifts: saved?.shifts != null ? Number(saved.shifts) : 0,
    shift_template_id: saved?.shift_template_id ?? null,
    work_location_id: saved?.work_location_id ?? null,
  };
}

function leaveOf(row: ScheduleRowOut, day: number): LeaveKind | null {
  return row.days[String(day)]?.leave_kind ?? null;
}

export default function SchedulePage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("staff.manage");
  const now = dayjs();
  const [month, setMonth] = useState<Dayjs>(now.startOf("month"));
  const [departmentId, setDepartmentId] = useState<number | undefined>();
  const [draft, setDraft] = useState<Record<DraftKey, DraftCell>>({});
  const [locationId, setLocationId] = useState<number | undefined>();
  const [fillOpen, setFillOpen] = useState(false);
  const [fillForm] = Form.useForm<FillValues>();

  const year = month.year();
  const monthNo = month.month() + 1;

  const departments = useQuery({
    queryKey: ["departments", "options"],
    queryFn: () => listDepartments({ limit: 200, offset: 0 }),
    staleTime: 60_000,
  });

  const templatesQuery = useQuery({
    queryKey: ["shift-templates", { includeInactive: true }],
    queryFn: () => listShiftTemplates(true),
    staleTime: 60_000,
  });
  const templates = templatesQuery.data ?? [];
  const templateById = new Map(templates.map((tpl) => [tpl.shift_template_id, tpl]));
  const activeTemplates = templates.filter((tpl) => tpl.is_active);

  const locationsQuery = useQuery({
    queryKey: ["work-locations", "options"],
    queryFn: () => listWorkLocations({ limit: 200, offset: 0 }),
    staleTime: 60_000,
  });
  const locationOptions = (locationsQuery.data?.items ?? []).map((l) => ({
    value: l.work_location_id,
    label: l.name,
  }));

  const grid = useQuery({
    queryKey: ["employee-schedule", year, monthNo, departmentId ?? null],
    queryFn: () =>
      getEmployeeSchedule({
        year,
        month: monthNo,
        department_id: departmentId,
      }),
  });

  const days = grid.data?.days_in_month ?? month.daysInMonth();
  const dirtyCount = Object.keys(draft).length;
  useUnsavedChanges(dirtyCount > 0, `Не сохранено клеток: ${dirtyCount}. Они потеряются.`);

  const save = useMutation({
    mutationFn: () => {
      const payload: ScheduleDayPut[] = Object.entries(draft).map(([key, cell]) => {
        const [employeeId, day] = key.split(":");
        return {
          employee_id: Number(employeeId),
          work_date: isoDate(year, monthNo, Number(day)),
          kind: cell.kind,
          shifts: cell.kind === "work" ? String(cell.shifts) : "0",
          shift_template_id: cell.kind === "work" ? (cell.shift_template_id ?? null) : null,
          work_location_id: cell.kind === "work" ? (cell.work_location_id ?? null) : null,
        };
      });
      return replaceScheduleDays(payload);
    },
    onSuccess: (r) => {
      message.success(`Сохранено клеток: ${r.written}`);
      setDraft({});
      queryClient.invalidateQueries({ queryKey: ["employee-schedule"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function setCell(row: ScheduleRowOut, day: number, cell: DraftCell) {
    setDraft((prev) => ({ ...prev, [`${row.employee_id}:${day}`]: cell }));
  }

  function cellMenu(row: ScheduleRowOut, day: number): MenuProps {
    return {
      items: [
        ...activeTemplates.map((tpl) => ({
          key: `tpl-${tpl.shift_template_id}`,
          label: `${tpl.name} ${hhmm(tpl.starts_at)}–${hhmm(tpl.ends_at)}`,
          onClick: () =>
            setCell(row, day, {
              kind: "work",
              shifts: 1,
              shift_template_id: tpl.shift_template_id,
              work_location_id: locationId ?? null,
            }),
        })),
        ...(activeTemplates.length ? [{ type: "divider" as const }] : []),
        ...SHIFT_STEPS.map((v) => ({
          key: `shift-${v}`,
          label: `${fmtShifts(v)} смены`,
          onClick: () => setCell(row, day, { kind: "work", shifts: v, shift_template_id: null }),
        })),
        { type: "divider" as const },
        {
          key: "dayoff",
          label: "В — выходной",
          onClick: () => setCell(row, day, { kind: "dayoff", shifts: 0 }),
        },
        {
          key: "clear",
          label: "Очистить (свободен)",
          onClick: () => setCell(row, day, { kind: null, shifts: 0 }),
        },
      ],
    };
  }

  const columns: ColumnsType<ScheduleRowOut> = useMemo(() => {
    const dayColumns: ColumnsType<ScheduleRowOut> = Array.from({ length: days }, (_, i) => {
      const day = i + 1;
      const weekday = dayjs(isoDate(year, monthNo, day)).day();
      const weekend = weekday === 0 || weekday === 6;
      return {
        title: String(day),
        key: `d${day}`,
        width: 38,
        align: "center" as const,
        onHeaderCell: () => (weekend ? { style: { background: "#fff1f0" } } : {}),
        onCell: () => (weekend ? { style: { background: "#fff7f6" } } : {}),
        render: (_: unknown, row: ScheduleRowOut) => {
          const key = `${row.employee_id}:${day}`;
          const cell = cellOf(row, day, draft);
          const leave = leaveOf(row, day);
          const isDraft = key in draft;
          let mark = "";
          const tpl = cell.shift_template_id ? templateById.get(cell.shift_template_id) : undefined;
          if (leave === "sick") mark = "Б";
          else if (leave === "vacation") mark = "О";
          else if (leave === "day_off") mark = "От";
          else if (cell.kind === "work" && cell.shift_template_id) mark = tplShort(tpl);
          else if (cell.kind === "work") mark = fmtShifts(cell.shifts);
          else if (cell.kind === "dayoff") mark = "В";
          const hint = tpl ? `${tpl.name} ${hhmm(tpl.starts_at)}–${hhmm(tpl.ends_at)}` : undefined;
          const content = (
            <div
              style={{
                cursor: canManage ? "pointer" : "default",
                background: isDraft ? "#fffbe6" : undefined,
                minHeight: 20,
                color: leave ? "#8c8c8c" : undefined,
              }}
            >
              {hint ? <Tooltip title={hint}>{mark}</Tooltip> : mark}
            </div>
          );
          if (!canManage) return content;
          return (
            <Dropdown menu={cellMenu(row, day)} trigger={["click"]}>
              {content}
            </Dropdown>
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
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, draft, canManage, year, monthNo, templates, locationId]);

  function openFill() {
    const start = dayjs(isoDate(year, monthNo, 1));
    fillForm.setFieldsValue({
      employee_ids: (grid.data?.rows ?? []).map((r) => r.employee_id),
      range: [start, start.endOf("month")],
      cycle: "5/2",
      work_days: 2,
      off_days: 2,
      first_work_day: start,
      shift_template_id: activeTemplates[0]?.shift_template_id,
      mark_dayoff: true,
    });
    setFillOpen(true);
  }

  function applyFill(v: FillValues) {
    const next: Record<DraftKey, DraftCell> = {};
    let d = v.range[0].startOf("day");
    const end = v.range[1].startOf("day");
    while (!d.isAfter(end)) {
      if (d.month() + 1 === monthNo && d.year() === year) {
        const work = isWorkDay(d, v);
        for (const id of v.employee_ids) {
          if (work) {
            next[`${id}:${d.date()}`] = {
              kind: "work",
              shifts: 1,
              shift_template_id: v.shift_template_id,
              work_location_id: locationId ?? null,
            };
          } else if (v.mark_dayoff) {
            next[`${id}:${d.date()}`] = { kind: "dayoff", shifts: 0 };
          }
        }
      }
      d = d.add(1, "day");
    }
    setDraft((prev) => ({ ...prev, ...next }));
    setFillOpen(false);
    message.info(`Заполнено клеток: ${Object.keys(next).length}. Проверьте и нажмите «Сохранить».`);
  }

  const deptOptions = [
    { value: -1, label: "Все отделы" },
    ...(departments.data?.items ?? []).map((d) => ({
      value: d.department_id,
      label: d.name,
    })),
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <Space align="baseline">
          <h2 style={{ margin: 0 }}>График</h2>
          {grid.data?.department_name && <Tag color="blue">{grid.data.department_name}</Tag>}
        </Space>
        <Space wrap>
          {canManage && (
            <Button icon={<CalendarOutlined />} onClick={openFill} disabled={!grid.data}>
              Заполнить по циклу
            </Button>
          )}
          {canManage && (
            <Button
              type="primary"
              icon={<SaveOutlined />}
              disabled={dirtyCount === 0}
              loading={save.isPending}
              onClick={() => save.mutate()}
            >
              Сохранить{dirtyCount ? ` (${dirtyCount})` : ""}
            </Button>
          )}
        </Space>
      </Space>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={`${periodLabel(year, monthNo)} — план, не табель`}
        description="Клетка со сменой — человек должен выйти; буквы — шаблон смены (наведите, чтобы увидеть время). «В» — явный выходной. Пусто — день не назначен, такого человека можно выбрать в заявлении «Обмен смены». Буквы О и Б приходят из отпусков и больничных и сами по себе клетку не правят."
      />
      {canManage && activeTemplates.length === 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Нет шаблонов смен"
          description="Без времени смены приложение не откроет «Приход» по графику и не посчитает опоздания. Заведите шаблоны в «Шаблонах смен»."
        />
      )}
      <Space style={{ marginBottom: 16 }} wrap>
        <DatePicker
          picker="month"
          value={month}
          allowClear={false}
          format="MMMM YYYY"
          onChange={(v) => {
            if (v) {
              setMonth(v.startOf("month"));
              setDraft({});
            }
          }}
        />
        <Select
          style={{ width: 220 }}
          options={deptOptions}
          value={departmentId ?? -1}
          onChange={(v: number) => {
            setDepartmentId(v === -1 ? undefined : v);
            setDraft({});
          }}
        />
        {canManage && (
          <Select
            allowClear
            style={{ width: 220 }}
            placeholder="Площадка для новых клеток"
            options={locationOptions}
            value={locationId}
            onChange={setLocationId}
          />
        )}
        <Select
          style={{ width: 160 }}
          options={MONTH_OPTIONS}
          value={monthNo}
          onChange={(v: number) => {
            setMonth(month.month(v - 1));
            setDraft({});
          }}
        />
      </Space>
      <Table
        rowKey="employee_id"
        size="small"
        loading={grid.isPending}
        dataSource={grid.data?.rows}
        columns={columns}
        pagination={false}
        scroll={{ x: 38 * days + 230 }}
        locale={{ emptyText: "Нет активных сотрудников" }}
      />
      <Modal
        title="Заполнить по циклу"
        open={fillOpen}
        onCancel={() => setFillOpen(false)}
        onOk={() => fillForm.submit()}
        okText="Заполнить"
        cancelText="Отмена"
        destroyOnClose
        width={560}
      >
        <Form form={fillForm} layout="vertical" onFinish={applyFill}>
          <Form.Item name="employee_ids" label="Сотрудники" rules={[{ required: true, message: "Выберите" }]}>
            <Select
              mode="multiple"
              maxTagCount="responsive"
              optionFilterProp="label"
              options={(grid.data?.rows ?? []).map((r) => ({ value: r.employee_id, label: r.employee_name }))}
            />
          </Form.Item>
          <Form.Item name="range" label="Дни" rules={[{ required: true, message: "Укажите" }]}>
            <DatePicker.RangePicker format="DD.MM.YYYY" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="cycle" label="Цикл">
            <Radio.Group
              options={[
                { value: "5/2", label: "5/2 (пн–пт)" },
                { value: "2/2", label: "2/2" },
                { value: "1/3", label: "сутки через трое" },
                { value: "custom", label: "свой" },
              ]}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(a, b) => a.cycle !== b.cycle}>
            {({ getFieldValue }) =>
              getFieldValue("cycle") === "5/2" ? null : (
                <Space wrap>
                  {getFieldValue("cycle") === "custom" && (
                    <>
                      <Form.Item name="work_days" label="Рабочих подряд">
                        <InputNumber min={1} max={14} />
                      </Form.Item>
                      <Form.Item name="off_days" label="Выходных подряд">
                        <InputNumber min={1} max={14} />
                      </Form.Item>
                    </>
                  )}
                  <Form.Item name="first_work_day" label="Первый рабочий день цикла">
                    <DatePicker format="DD.MM.YYYY" allowClear={false} />
                  </Form.Item>
                </Space>
              )
            }
          </Form.Item>
          <Form.Item
            name="shift_template_id"
            label="Смена в рабочие дни"
            rules={[{ required: true, message: "Выберите шаблон смены" }]}
          >
            <Select
              options={activeTemplates.map((tpl) => ({
                value: tpl.shift_template_id,
                label: `${tpl.name} ${hhmm(tpl.starts_at)}–${hhmm(tpl.ends_at)}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="mark_dayoff" valuePropName="checked">
            <Checkbox>Остальные дни отметить «В» (выходной)</Checkbox>
          </Form.Item>
          <Typography.Text type="secondary">
            Площадка — из поля «Площадка для новых клеток». Заполненное сохраняется кнопкой «Сохранить».
          </Typography.Text>
        </Form>
      </Modal>
    </div>
  );
}
