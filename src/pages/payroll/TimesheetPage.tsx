/** Табель — сетка месяц × сотрудники: в клетке смены или отсутствие.
 *
 * **Табель ведётся по отделам (цехам).** Селектор отдела вверху — это и есть
 * «отдельный табель на каждый цех»: в бумажном виде такой лист подписывает
 * начальник цеха, и чужие люди в нём не нужны. «Все отделы» остаётся для
 * расчётчиков — им табель нужен целиком, когда они собирают ведомость.
 *
 * **Отсутствия живут в этой же сетке**, а не на отдельном экране: В — выходной,
 * Б — больничный, О — отпуск, БС — отпуск без содержания. Отпуска и больничные
 * подтягиваются из согласованных заявлений (кнопка «Подтянуть отпуска» и
 * автоматически при сборке из отметок) — дважды одно и то же не отмечают.
 *
 * Клетки правятся прямо в сетке: изменения копятся локально и уходят одним
 * запросом по «Сохранить» — иначе на 91 сотруднике × 31 день получилось бы под
 * три тысячи запросов. Клик по клетке открывает меню отметок: смены нажимаются
 * часто, а отпуск и больничный должны быть в том же месте, а не в другом экране.
 */
import {
  DownloadOutlined,
  PlusOutlined,
  PrinterOutlined,
  ReloadOutlined,
  SaveOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import {
  App,
  Alert,
  Button,
  Dropdown,
  Form,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { MenuProps } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  closeTimesheet,
  createTimesheet,
  downloadDepartmentTimesheet,
  downloadPayrollWorkbook,
  getTimesheetGrid,
  listTimesheets,
  rebuildTimesheet,
  reopenTimesheet,
  setTimesheetDays,
  syncTimesheetAbsences,
  updateTimesheet,
  type TimesheetDayIn,
  type TimesheetDayKind,
  type TimesheetRowOut,
} from "@/api/payroll";
import { listDepartments } from "@/api/staff";
import { useCan } from "@/auth/store";
import { useUnsavedChanges } from "@/components/useUnsavedChanges";
import {
  ABSENCE_META,
  MONTH_OPTIONS,
  ShiftCell,
  TimesheetStatusTag,
  fmtShifts,
  periodLabel,
} from "@/pages/payroll/shared";

/** Ключ незакоммиченной правки: "<employee_id>:<day>". */
type DraftKey = string;

/** Незакоммиченная клетка: смены ИЛИ отсутствие (у отсутствия смен нет). */
interface DraftCell {
  shifts: number;
  kind: TimesheetDayKind;
}

/** Пункты меню клетки: сперва частое (смены), потом отсутствия. */
const SHIFT_STEPS = [1, 1.5, 2, 0.5];
const ABSENCE_KINDS: Exclude<TimesheetDayKind, "work">[] = [
  "sick",
  "vacation",
  "vacation_unpaid",
  "dayoff",
];

export default function TimesheetPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("payroll.manage");
  const [timesheetId, setTimesheetId] = useState<number | undefined>();
  /** undefined — «все отделы»; иначе табель одного цеха. */
  const [departmentId, setDepartmentId] = useState<number | undefined>();
  const [draft, setDraft] = useState<Record<DraftKey, DraftCell>>({});
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

  const departments = useQuery({
    queryKey: ["departments", "options"],
    queryFn: () => listDepartments({ limit: 200, offset: 0 }),
    staleTime: 60_000,
  });

  // Первый доступный табель выбирается сам — иначе страница открывается пустой.
  const effectiveId = timesheetId ?? timesheets.data?.items[0]?.timesheet_id;

  const grid = useQuery({
    queryKey: ["timesheet-grid", effectiveId, departmentId ?? null],
    queryFn: () => getTimesheetGrid(effectiveId!, departmentId),
    enabled: effectiveId != null,
  });

  const days = grid.data?.days_in_month ?? 31;
  const cutoff = grid.data?.timesheet.advance_cutoff_day ?? 15;
  const isClosed = grid.data?.timesheet.status === "closed";
  const dirtyCount = Object.keys(draft).length;
  // Заполненный день не должен пропадать молча — ни по «закрыть вкладку»,
  // ни по переходу в другой раздел.
  useUnsavedChanges(dirtyCount > 0,
                    `Не сохранено клеток: ${dirtyCount}. Они потеряются.`);
  const editable = canManage && !isClosed;

  /** Сетку перечитываем во всех разрезах: правка в одном отделе меняет и «все». */
  const invalidateGrid = () =>
    queryClient.invalidateQueries({ queryKey: ["timesheet-grid", effectiveId] });

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
      const payload: TimesheetDayIn[] = Object.entries(draft).map(([key, cell]) => {
        const [employeeId, day] = key.split(":");
        return {
          employee_id: Number(employeeId),
          day: Number(day),
          // У отсутствия смен нет — бэкенд такую клетку и не примет.
          shifts: cell.kind === "work" ? String(cell.shifts) : "0",
          kind: cell.kind,
        };
      });
      return setTimesheetDays(effectiveId!, payload, departmentId);
    },
    onSuccess: () => {
      message.success(`Сохранено клеток: ${dirtyCount}`);
      setDraft({});
      invalidateGrid();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const rebuild = useMutation({
    mutationFn: (overwriteManual: boolean) => rebuildTimesheet(effectiveId!, overwriteManual),
    onSuccess: (r) => {
      message.success(
        `Собрано из отметок: клеток ${r.days_written}, сотрудников ${r.employees_touched}` +
          (r.days_skipped_manual ? `, сохранено правок ${r.days_skipped_manual}` : "") +
          (r.absence_days_written ? `; отпусков и больничных ${r.absence_days_written}` : ""),
      );
      if (r.absence_conflicts) {
        message.warning(
          `Дней, где отпуск наложился на отметку смены: ${r.absence_conflicts}. ` +
            "Там оставлена смена — проверьте, отзывали человека из отпуска или ошиблись отметкой.",
          10,
        );
      }
      setDraft({});
      invalidateGrid();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const syncAbsences = useMutation({
    mutationFn: () => syncTimesheetAbsences(effectiveId!),
    onSuccess: (r) => {
      message.success(
        r.absence_days_written
          ? `Из заявлений подтянуто дней: ${r.absence_days_written}`
          : "Новых отпусков и больничных в этом месяце нет",
      );
      if (r.absence_conflicts) {
        message.warning(
          `Наложений на отметки смен: ${r.absence_conflicts} — там оставлена смена.`,
          10,
        );
      }
      invalidateGrid();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const changeCutoff = useMutation({
    mutationFn: (day: number) => updateTimesheet(effectiveId!, { advance_cutoff_day: day }),
    onSuccess: () => {
      message.success("Отсечка аванса изменена");
      invalidateGrid();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const toggleClosed = useMutation({
    mutationFn: () => (isClosed ? reopenTimesheet(effectiveId!) : closeTimesheet(effectiveId!)),
    onSuccess: () => {
      message.success(isClosed ? "Табель открыт" : "Табель закрыт");
      invalidateGrid();
      queryClient.invalidateQueries({ queryKey: ["timesheets"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const downloadSheet = useMutation({
    mutationFn: () => {
      const ts = grid.data!.timesheet;
      const dept = grid.data!.department_name;
      const suffix = dept ? `_${dept.replace(/\s+/g, "_")}` : "";
      return downloadDepartmentTimesheet(
        ts.timesheet_id,
        departmentId,
        `tabel_${ts.period_year}_${String(ts.period_month).padStart(2, "0")}${suffix}.xlsx`,
      );
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const downloadBook = useMutation({
    mutationFn: () => {
      const ts = grid.data!.timesheet;
      return downloadPayrollWorkbook(
        ts.timesheet_id,
        `zp_${ts.period_year}_${String(ts.period_month).padStart(2, "0")}.xlsx`,
      );
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function cellOf(row: TimesheetRowOut, day: number): DraftCell {
    const key = `${row.employee_id}:${day}`;
    if (key in draft) return draft[key];
    return {
      shifts: Number(row.days[String(day)] ?? 0),
      kind: (row.kinds[String(day)] as TimesheetDayKind) ?? "work",
    };
  }

  function setCell(row: TimesheetRowOut, day: number, cell: DraftCell) {
    setDraft((prev) => ({ ...prev, [`${row.employee_id}:${day}`]: cell }));
  }

  /** Меню клетки: смены, отсутствия, «очистить». */
  function cellMenu(row: TimesheetRowOut, day: number): MenuProps {
    const current = cellOf(row, day);
    return {
      items: [
        ...SHIFT_STEPS.map((v) => ({
          key: `shift-${v}`,
          label: `${fmtShifts(v)} смены`,
          onClick: () => setCell(row, day, { shifts: v, kind: "work" }),
        })),
        { type: "divider" as const },
        ...ABSENCE_KINDS.map((kind) => ({
          key: kind,
          label: `${ABSENCE_META[kind].mark} — ${ABSENCE_META[kind].label}`,
          onClick: () => setCell(row, day, { shifts: 0, kind }),
        })),
        { type: "divider" as const },
        {
          key: "clear",
          label: "Очистить",
          disabled: current.kind === "work" && current.shifts === 0,
          onClick: () => setCell(row, day, { shifts: 0, kind: "work" }),
        },
      ],
    };
  }

  /** Итоги пересчитываются локально, чтобы правки было видно до сохранения. */
  function rowTotals(row: TimesheetRowOut) {
    let advance = 0;
    let month = 0;
    let sick = 0;
    let vacation = 0;
    for (let d = 1; d <= days; d += 1) {
      const cell = cellOf(row, d);
      if (cell.kind === "work") {
        month += cell.shifts;
        if (d <= cutoff) advance += cell.shifts;
      } else if (cell.kind === "sick") {
        sick += 1;
      } else if (cell.kind === "vacation" || cell.kind === "vacation_unpaid") {
        vacation += 1;
      }
    }
    return { advance, month, sick, vacation };
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
          const cell = cellOf(row, day);
          const isDraft = key in draft;
          const content = (
            <div
              style={{
                cursor: editable ? "pointer" : "default",
                background: isDraft ? "#fffbe6" : undefined,
                minHeight: 20,
              }}
            >
              <ShiftCell
                value={cell.shifts === 0 ? undefined : String(cell.shifts)}
                source={isDraft ? "manual" : row.sources[String(day)]}
                kind={cell.kind}
              />
            </div>
          );
          if (!editable) return content;
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
      {
        title: "Б",
        key: "sick",
        width: 46,
        align: "center",
        fixed: "right",
        render: (_: unknown, row) => rowTotals(row).sick || "—",
      },
      {
        title: "О/БС",
        key: "vacation",
        width: 56,
        align: "center",
        fixed: "right",
        render: (_: unknown, row) => rowTotals(row).vacation || "—",
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, cutoff, draft, canManage, isClosed]);

  /** Печать: своя страница с чистой таблицей — на бумагу не должен попасть
   *  интерфейс, а antd-таблица с фиксированными колонками печатается кусками. */
  function printSheet() {
    const data = grid.data;
    if (!data) return;
    const win = window.open("", "_blank", "width=1100,height=700");
    if (!win) {
      message.warning("Браузер заблокировал окно печати — разрешите всплывающие окна");
      return;
    }
    const title =
      `Табель — ${periodLabel(data.timesheet.period_year, data.timesheet.period_month)}` +
      (data.department_name ? ` — ${data.department_name}` : "");
    const head = Array.from({ length: data.days_in_month }, (_, i) => `<th>${i + 1}</th>`).join("");
    const body = data.rows
      .map((row, idx) => {
        const totals = rowTotals(row);
        const cells = Array.from({ length: data.days_in_month }, (_, i) => {
          const cell = cellOf(row, i + 1);
          const text =
            cell.kind === "work"
              ? cell.shifts === 0
                ? ""
                : fmtShifts(cell.shifts)
              : ABSENCE_META[cell.kind].mark;
          return `<td>${text}</td>`;
        }).join("");
        return (
          `<tr><td>${idx + 1}</td><td class="name">${escapeHtml(row.employee_name)}</td>` +
          `<td class="name">${escapeHtml(row.position ?? "")}</td>${cells}` +
          `<td><b>${fmtShifts(totals.advance)}</b></td>` +
          `<td><b>${fmtShifts(totals.month)}</b></td>` +
          `<td>${totals.sick || ""}</td><td>${totals.vacation || ""}</td></tr>`
        );
      })
      .join("");
    win.document.open();
    win.document.write(`<!doctype html><html><head><meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4 landscape; margin: 8mm; }
  body { font-family: system-ui, "Segoe UI", sans-serif; font-size: 11px; margin: 0; }
  h1 { font-size: 15px; margin: 0 0 2px; }
  .hint { color: #555; font-size: 10px; margin: 0 0 8px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #999; padding: 2px 3px; text-align: center; }
  th { background: #f0f0f0; }
  td.name, th.name { text-align: left; white-space: nowrap; }
  .sign { margin-top: 16px; font-size: 11px; }
</style></head><body>
<h1>${escapeHtml(title)}</h1>
<p class="hint">1 — полная смена, 0,5 — половина. В — выходной, Б — больничный,
О — отпуск, БС — отпуск без содержания. Аванс считается по дни с 1 по
${data.timesheet.advance_cutoff_day}.</p>
<table><thead><tr><th>№</th><th class="name">ФИО</th><th class="name">Должность</th>
${head}<th>Аванс</th><th>Месяц</th><th>Б</th><th>О/БС</th></tr></thead>
<tbody>${body}</tbody></table>
<p class="sign">Начальник отдела / цеха ______________________&nbsp;&nbsp;&nbsp;
Дата ____________</p>
</body></html>`);
    win.document.close();
    win.onafterprint = () => win.close();
    window.setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch {
        /* окно успели закрыть руками */
      }
    }, 100);
  }

  const now = new Date();
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
          <h2 style={{ margin: 0 }}>Табель</h2>
          {grid.data?.department_name && <Tag color="blue">{grid.data.department_name}</Tag>}
        </Space>
        <Space wrap>
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
            icon={<PrinterOutlined />}
            disabled={grid.data == null}
            onClick={printSheet}
          >
            Печать
          </Button>
          <Button
            icon={<DownloadOutlined />}
            disabled={effectiveId == null}
            loading={downloadSheet.isPending}
            onClick={() => downloadSheet.mutate()}
          >
            Выгрузить табель
          </Button>
          <Button
            icon={<DownloadOutlined />}
            disabled={effectiveId == null}
            loading={downloadBook.isPending}
            onClick={() => downloadBook.mutate()}
          >
            Книга за период
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
        {/* Отдел — главный переключатель этого экрана: табель ведут по цехам. */}
        <Select
          style={{ width: 240 }}
          value={departmentId ?? -1}
          onChange={(v) => {
            setDepartmentId(v === -1 ? undefined : v);
            setDraft({});
          }}
          options={deptOptions}
          showSearch
          optionFilterProp="label"
          loading={departments.isPending}
        />
        {grid.data && <TimesheetStatusTag status={grid.data.timesheet.status} />}
        {grid.data && (
          <Space size={4}>
            <span>Аванс за дни с 1 по:</span>
            <InputNumber
              min={1}
              max={days}
              value={cutoff}
              disabled={!editable}
              onChange={(v) => v && changeCutoff.mutate(v)}
              style={{ width: 70 }}
            />
          </Space>
        )}
        {editable && effectiveId != null && (
          <Popconfirm
            title="Собрать табель из отметок?"
            description={
              <div style={{ maxWidth: 340 }}>
                Каждая закрытая смена даст 1 за свой день; отпуска и больничные
                подтянутся из согласованных заявлений. Ручные правки и
                согласованные перерасчёты сохранятся. Собирается табель ЦЕЛИКОМ,
                а не только выбранный отдел.
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
        {editable && effectiveId != null && (
          <Button
            icon={<SyncOutlined />}
            loading={syncAbsences.isPending}
            onClick={() => syncAbsences.mutate()}
          >
            Подтянуть отпуска
          </Button>
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
          зависит. Клик по клетке открывает отметки: смены и отсутствия.{" "}
          <b style={{ color: ABSENCE_META.dayoff.color }}>В</b> — выходной,{" "}
          <b style={{ color: ABSENCE_META.sick.color }}>Б</b> — больничный,{" "}
          <b style={{ color: ABSENCE_META.vacation.color }}>О</b> — отпуск,{" "}
          <b style={{ color: ABSENCE_META.vacation_unpaid.color }}>БС</b> — без содержания.
          Цвет числа — источник:{" "}
          <span style={{ color: "#1677ff" }}>автосбор из отметок</span>,{" "}
          <span style={{ color: "#d48806" }}>правка вручную</span>,{" "}
          <span style={{ color: "#c41d7f" }}>согласованный перерасчёт</span>,{" "}
          <span style={{ color: "#389e0d" }}>из заявлений</span>.
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
        locale={{
          emptyText:
            departmentId != null
              ? "В этом отделе нет сменщиков — табель им не нужен"
              : "Сменщиков нет: заведите карточки оплаты с типом «смены»",
        }}
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

/** Экранирование для окна печати: в ФИО и должности бывают < и &. */
function escapeHtml(s: string): string {
  return s.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);
}
