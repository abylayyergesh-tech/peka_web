/** Плановый график: кто в какой день должен выйти. Это не табель.
 *
 * Табель — факт (отметки, отпуска, ручная правка). Здесь HR рисует план.
 * Пустая клетка = день не назначен = человек свободен принять чужую смену.
 * Заявление «Обмен смены» читает именно эту сетку.
 */
import { SaveOutlined } from "@ant-design/icons";
import {
  App,
  Alert,
  Button,
  DatePicker,
  Dropdown,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { MenuProps } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  getEmployeeSchedule,
  listDepartments,
  replaceScheduleDays,
  type ScheduleDayPut,
  type ScheduleKind,
  type ScheduleRowOut,
} from "@/api/staff";
import { useCan } from "@/auth/store";
import { useUnsavedChanges } from "@/components/useUnsavedChanges";
import { MONTH_OPTIONS, fmtShifts, periodLabel } from "@/pages/payroll/shared";

type DraftKey = string;

interface DraftCell {
  kind: ScheduleKind | null;
  shifts: number;
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
  };
}

function leaveOf(row: ScheduleRowOut, day: number): "vacation" | "sick" | null {
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

  const year = month.year();
  const monthNo = month.month() + 1;

  const departments = useQuery({
    queryKey: ["departments", "options"],
    queryFn: () => listDepartments({ limit: 200, offset: 0 }),
    staleTime: 60_000,
  });

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
        ...SHIFT_STEPS.map((v) => ({
          key: `shift-${v}`,
          label: `${fmtShifts(v)} смены`,
          onClick: () => setCell(row, day, { kind: "work", shifts: v }),
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
          if (leave === "sick") mark = "Б";
          else if (leave === "vacation") mark = "О";
          else if (cell.kind === "work") mark = fmtShifts(cell.shifts);
          else if (cell.kind === "dayoff") mark = "В";
          const content = (
            <div
              style={{
                cursor: canManage ? "pointer" : "default",
                background: isDraft ? "#fffbe6" : undefined,
                minHeight: 20,
                color: leave ? "#8c8c8c" : undefined,
              }}
            >
              {mark}
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
  }, [days, draft, canManage, year, monthNo]);

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
        description="Клетка со сменой — человек должен выйти. «В» — явный выходной. Пусто — день не назначен, такого человека можно выбрать в заявлении «Обмен смены». Буквы О и Б приходят из отпусков и больничных и сами по себе клетку не правят."
      />
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
    </div>
  );
}
