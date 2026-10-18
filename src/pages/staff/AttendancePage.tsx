/** «Отметки смен»: журнал отметок из приложения сотрудника.
 *
 * Каждая смена — приход и уход с селфи, точкой и флагами. Спорные отметки (вне
 * зоны, подмена GPS, root, вне графика) ждут решения: принятая идёт в табель,
 * отклонённая — нет, сотрудник видит решение и комментарий. Переработка
 * попадает в табель после подтверждения. Смены без отметки ухода закрывает
 * система — фактическое время ставят здесь.
 *
 * Правят смену только здесь и только с причиной: она и прежнее значение
 * попадают в историю правок. Руководитель цеха решает то же самое в приложении
 * («Мой цех») по своим людям. */
import {
  App,
  Button,
  DatePicker,
  Descriptions,
  Form,
  Image,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Timeline,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  closeShift,
  decideMark,
  decideOvertime,
  listAbsences,
  listShiftEdits,
  listShifts,
  listWorkLocations,
  resolveAbsence,
  updateShift,
  type AttendanceAbsenceOut,
  type AttendanceMarkOut,
  type AttendanceShiftOut,
  type ShiftListParams,
} from "@/api/attendance";
import { errorMessage } from "@/api/client";
import { listEmployees } from "@/api/staff";
import { useCan } from "@/auth/store";
import { fmtDate, fmtDateTime } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import {
  DISPUTE_REASON_LABELS,
  DisputeTag,
  OvertimeTag,
  ShiftStatusTag,
  fmtDuration,
} from "@/pages/staff/shared";

const { RangePicker } = DatePicker;

type View = "all" | "disputed" | "overtime" | "no_clock_out" | "absences";

interface EditFormValues {
  work_location_id?: number;
  clock_in_at: Dayjs;
  clock_out_at?: Dayjs;
  reason: string;
}

interface CloseFormValues {
  clock_out_at: Dayjs;
  reason: string;
}

const STATUS_OPTIONS = [
  { value: "open", label: "Открыта" },
  { value: "closed", label: "Закрыта" },
];

const ABSENCE_LABELS: Record<string, string> = {
  no_show: "неявка",
  excused: "уважительная",
  unexcused: "прогул",
};

function time(v: string | null): string {
  return v ? dayjs(v).format("HH:mm") : "—";
}

function mapUrl(lat: string | null, lon: string | null): string | null {
  return lat && lon ? `https://www.google.com/maps/search/?api=1&query=${lat},${lon}` : null;
}

function ShiftFlags({ s }: { s: AttendanceShiftOut }) {
  return (
    <Space size={4} wrap>
      <ShiftStatusTag status={s.status} />
      <DisputeTag status={s.dispute_status} />
      {s.dispute_reasons.map((r) => (
        <Tag key={r}>{DISPUTE_REASON_LABELS[r] ?? r}</Tag>
      ))}
      <OvertimeTag status={s.overtime_status} />
      {s.close_reason === "no_clock_out" && <Tag color="volcano">нет ухода</Tag>}
      {s.is_edited && <Tag color="warning">изменена</Tag>}
    </Space>
  );
}

export default function AttendancePage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("attendance.manage");
  const { limit, offset, tablePagination, reset } = usePagination();

  const [view, setView] = useState<View>("all");
  const [employeeId, setEmployeeId] = useState<number | undefined>();
  const [workLocationId, setWorkLocationId] = useState<number | undefined>();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);

  const [card, setCard] = useState<AttendanceShiftOut | null>(null);
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState<AttendanceShiftOut | null>(null);
  const [rejecting, setRejecting] = useState<AttendanceMarkOut | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [resolving, setResolving] = useState<AttendanceAbsenceOut | null>(null);
  const [resolveComment, setResolveComment] = useState("");
  const [editForm] = Form.useForm<EditFormValues>();
  const [closeForm] = Form.useForm<CloseFormValues>();

  const from = range ? range[0].format("YYYY-MM-DD") : undefined;
  const to = range ? range[1].format("YYYY-MM-DD") : undefined;

  const params: ShiftListParams = {
    limit,
    offset,
    employee_id: employeeId,
    work_location_id: workLocationId,
    status: statusFilter,
    from,
    to,
    ...(view === "disputed" ? { dispute: "pending" as const } : {}),
    ...(view === "overtime" ? { overtime: "pending" as const } : {}),
    ...(view === "no_clock_out" ? { close_reason: "no_clock_out" as const } : {}),
  };
  const query = useQuery({
    queryKey: ["shifts", params],
    queryFn: () => listShifts(params),
    enabled: view !== "absences",
  });
  const absencesQuery = useQuery({
    queryKey: ["absences", { from, to }],
    queryFn: () => listAbsences({ from, to }),
    enabled: view === "absences",
  });

  const empQuery = useQuery({
    queryKey: ["employees", "options"],
    queryFn: () => listEmployees({ limit: 200, offset: 0 }),
    staleTime: 60_000,
  });
  const empOptions =
    empQuery.data?.items.map((e) => ({ value: e.employee_id, label: e.full_name })) ?? [];

  const locQuery = useQuery({
    queryKey: ["work-locations", "options", "all"],
    queryFn: () => listWorkLocations({ limit: 200, offset: 0, include_inactive: true }),
    staleTime: 60_000,
  });
  const locOptions =
    locQuery.data?.items.map((l) => ({ value: l.work_location_id, label: l.name })) ?? [];

  const editsQuery = useQuery({
    queryKey: ["shift-edits", card?.attendance_shift_id],
    queryFn: () => listShiftEdits(card!.attendance_shift_id),
    enabled: card != null,
  });

  function refresh(row?: AttendanceShiftOut) {
    queryClient.invalidateQueries({ queryKey: ["shifts"] });
    queryClient.invalidateQueries({ queryKey: ["shift-edits"] });
    queryClient.invalidateQueries({ queryKey: ["absences"] });
    if (row) setCard(row);
  }

  const saveEdit = useMutation({
    mutationFn: (values: EditFormValues) =>
      updateShift(card!.attendance_shift_id, {
        ...(values.work_location_id ? { work_location_id: values.work_location_id } : {}),
        clock_in_at: values.clock_in_at.toISOString(),
        clock_out_at: values.clock_out_at ? values.clock_out_at.toISOString() : null,
        reason: values.reason.trim(),
      }),
    onSuccess: (row) => {
      message.success("Смена скорректирована");
      setEditing(false);
      refresh(row);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const doClose = useMutation({
    mutationFn: (values: CloseFormValues) =>
      closeShift(closing!.attendance_shift_id, {
        clock_out_at: values.clock_out_at.toISOString(),
        reason: values.reason.trim(),
      }),
    onSuccess: (row) => {
      message.success("Смена закрыта");
      setClosing(null);
      refresh(card ? row : undefined);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const markDecision = useMutation({
    mutationFn: (v: { mark: AttendanceMarkOut; decision: "accept" | "reject"; comment?: string }) =>
      decideMark(v.mark.mark_id, v.decision, v.comment),
    onSuccess: (_, v) => {
      message.success(v.decision === "accept" ? "Отметка принята" : "Отметка отклонена");
      setRejecting(null);
      refresh();
      setCard(null);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const overtimeDecision = useMutation({
    mutationFn: (v: { shiftId: number; decision: "approve" | "reject" }) =>
      decideOvertime(v.shiftId, v.decision),
    onSuccess: (_, v) => {
      message.success(v.decision === "approve" ? "Переработка принята" : "Переработка не принята");
      refresh();
      setCard(null);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const absenceDecision = useMutation({
    mutationFn: (v: { id: number; resolution: "excused" | "unexcused"; comment?: string }) =>
      resolveAbsence(v.id, v.resolution, v.comment),
    onSuccess: () => {
      message.success("Неявка разобрана");
      setResolving(null);
      refresh();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function startEdit(row: AttendanceShiftOut) {
    editForm.setFieldsValue({
      work_location_id: row.work_location_id ?? undefined,
      clock_in_at: dayjs(row.clock_in_at),
      clock_out_at: row.clock_out_at ? dayjs(row.clock_out_at) : undefined,
      reason: "",
    });
    setEditing(true);
  }

  function openClose(row: AttendanceShiftOut) {
    setClosing(row);
    closeForm.setFieldsValue({
      clock_out_at: row.scheduled_end ? dayjs(row.scheduled_end) : dayjs(),
      reason: "",
    });
  }

  const columns: ColumnsType<AttendanceShiftOut> = [
    {
      title: "Сотрудник",
      dataIndex: "employee_name",
      render: (v, row) => v || `#${row.employee_id}`,
    },
    {
      title: "Смена по графику",
      key: "plan",
      render: (_, r) =>
        r.scheduled_start ? (
          <span>
            {r.shift_name} {time(r.scheduled_start)}–{time(r.scheduled_end)}
          </span>
        ) : (
          <Typography.Text type="secondary">вне графика</Typography.Text>
        ),
    },
    {
      title: "Приход",
      key: "in",
      render: (_, r) => (
        <Space size={4}>
          {fmtDateTime(r.clock_in_at)}
          {(r.late_minutes ?? 0) > 0 && <Tag color="red">опоздание {r.late_minutes} мин</Tag>}
        </Space>
      ),
    },
    {
      title: "Уход",
      key: "out",
      render: (_, r) => (
        <Space size={4}>
          {fmtDateTime(r.clock_out_at)}
          {(r.early_leave_minutes ?? 0) > 0 && (
            <Tag color="orange">ранний уход {r.early_leave_minutes} мин</Tag>
          )}
          {(r.overtime_minutes ?? 0) > 0 && <Tag color="gold">+{r.overtime_minutes} мин</Tag>}
        </Space>
      ),
    },
    { title: "Отработано", dataIndex: "worked_minutes", render: (v) => fmtDuration(v), width: 110 },
    { title: "Отметки", key: "flags", render: (_, r) => <ShiftFlags s={r} /> },
  ];

  const absenceColumns: ColumnsType<AttendanceAbsenceOut> = [
    { title: "Сотрудник", dataIndex: "employee_name", render: (v, r) => v || `#${r.employee_id}` },
    { title: "День", dataIndex: "work_date", render: (v) => fmtDate(v), width: 120 },
    { title: "Смена с", dataIndex: "scheduled_start", render: (v) => time(v), width: 100 },
    {
      title: "Статус",
      dataIndex: "status",
      width: 140,
      render: (v: string) => (
        <Tag color={v === "unexcused" ? "red" : v === "excused" ? "green" : "orange"}>
          {ABSENCE_LABELS[v] ?? v}
        </Tag>
      ),
    },
    { title: "Комментарий", dataIndex: "comment", render: (v) => v || "—" },
    {
      title: "",
      key: "act",
      width: 120,
      render: (_, r) =>
        canManage && r.status === "no_show" ? (
          <a
            onClick={() => {
              setResolveComment("");
              setResolving(r);
            }}
          >
            Разобрать
          </a>
        ) : null,
    },
  ];

  const filters = (
    <Space style={{ marginBottom: 16 }} wrap>
      {view !== "absences" && (
        <>
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
          {view === "all" && (
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
          )}
        </>
      )}
      <RangePicker
        format="DD.MM.YYYY"
        value={range}
        onChange={(v) => {
          setRange(v as [Dayjs, Dayjs] | null);
          reset();
        }}
      />
    </Space>
  );

  return (
    <div>
      <Space style={{ justifyContent: "space-between", width: "100%" }} align="baseline">
        <h2 style={{ marginTop: 0 }}>Отметки смен</h2>
        <Link to="/payroll/timesheet">Табель за месяц →</Link>
      </Space>
      <Typography.Paragraph type="secondary">
        Отметки из приложения: приход и уход с селфи и точкой на карте. Спорная отметка идёт в{" "}
        <Link to="/payroll/timesheet">табель</Link> только после решения «Принять». Правка смены —
        здесь и только с причиной.
      </Typography.Paragraph>

      <Tabs
        activeKey={view}
        onChange={(k) => {
          setView(k as View);
          reset();
        }}
        items={[
          { key: "all", label: "Все" },
          { key: "disputed", label: "Спорные" },
          { key: "overtime", label: "Переработки" },
          { key: "no_clock_out", label: "Без ухода" },
          { key: "absences", label: "Неявки" },
        ]}
      />
      {filters}

      {view === "absences" ? (
        <Table
          rowKey="absence_id"
          size="small"
          loading={absencesQuery.isPending}
          dataSource={absencesQuery.data}
          columns={absenceColumns}
          pagination={false}
        />
      ) : (
        <Table
          rowKey="attendance_shift_id"
          size="small"
          loading={query.isPending}
          dataSource={query.data?.items}
          pagination={tablePagination(query.data?.total)}
          columns={columns}
          scroll={{ x: 1100 }}
          rowClassName={() => "row-clickable"}
          onRow={(row) => ({
            onClick: () => {
              setCard(row);
              setEditing(false);
            },
          })}
        />
      )}

      <Modal
        open={card != null}
        onCancel={() => {
          setCard(null);
          setEditing(false);
        }}
        title={card?.employee_name || (card ? `#${card.employee_id}` : "Смена")}
        width={760}
        footer={null}
        destroyOnClose
      >
        {card && !editing && (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Смена по графику">
                {card.scheduled_start
                  ? `${card.shift_name ?? ""} ${fmtDateTime(card.scheduled_start)} – ${time(card.scheduled_end)}`
                  : "вне графика"}
              </Descriptions.Item>
              <Descriptions.Item label="Площадка">{card.work_location_name || "—"}</Descriptions.Item>
              <Descriptions.Item label="Пришёл / ушёл">
                {fmtDateTime(card.clock_in_at)} – {card.clock_out_at ? fmtDateTime(card.clock_out_at) : "ещё на смене"}
              </Descriptions.Item>
              <Descriptions.Item label="Отработано">{fmtDuration(card.worked_minutes)}</Descriptions.Item>
              <Descriptions.Item label="Учёт">
                <Space size={4} wrap>
                  {(card.late_minutes ?? 0) > 0 && <Tag color="red">опоздание {card.late_minutes} мин</Tag>}
                  {(card.early_leave_minutes ?? 0) > 0 && (
                    <Tag color="orange">ранний уход {card.early_leave_minutes} мин</Tag>
                  )}
                  {(card.overtime_minutes ?? 0) > 0 && (
                    <Tag color="gold">переработка {card.overtime_minutes} мин</Tag>
                  )}
                  <ShiftFlags s={card} />
                </Space>
              </Descriptions.Item>
            </Descriptions>

            {card.marks.map((m) => (
              <div key={m.mark_id} style={{ display: "flex", gap: 16 }}>
                {m.photo_url ? (
                  <Image src={m.photo_url} width={120} height={160} style={{ objectFit: "cover" }} />
                ) : (
                  <div style={{ width: 120, height: 160, background: "#f5f5f5" }} />
                )}
                <div style={{ flex: 1 }}>
                  <Typography.Text strong>
                    {m.kind === "clock_in" ? "Приход" : "Уход"} · {fmtDateTime(m.marked_at)}
                  </Typography.Text>
                  <div>
                    {m.work_location_name || "площадка не определена"}
                    {m.distance_m != null && ` · ${m.distance_m} м от точки`}
                    {m.accuracy_m && ` · точность ${Number(m.accuracy_m)} м`}
                    {mapUrl(m.latitude, m.longitude) && (
                      <>
                        {" · "}
                        <a href={mapUrl(m.latitude, m.longitude)!} target="_blank" rel="noreferrer">
                          на карте
                        </a>
                      </>
                    )}
                  </div>
                  <Space size={4} wrap style={{ marginTop: 4 }}>
                    <DisputeTag status={m.dispute_status} />
                    {m.dispute_reasons.map((r) => (
                      <Tag key={r}>{DISPUTE_REASON_LABELS[r] ?? r}</Tag>
                    ))}
                  </Space>
                  {m.comment && <div>Сотрудник: «{m.comment}»</div>}
                  {m.decision_comment && <div>Решение: «{m.decision_comment}»</div>}
                  {canManage && m.dispute_status === "pending" && (
                    <Space style={{ marginTop: 8 }}>
                      <Button
                        type="primary"
                        size="small"
                        loading={markDecision.isPending}
                        onClick={() => markDecision.mutate({ mark: m, decision: "accept" })}
                      >
                        Принять
                      </Button>
                      <Button
                        size="small"
                        danger
                        onClick={() => {
                          setRejectComment("");
                          setRejecting(m);
                        }}
                      >
                        Отклонить
                      </Button>
                    </Space>
                  )}
                </div>
              </div>
            ))}

            {canManage && (
              <Space wrap>
                {card.overtime_status === "pending" && (
                  <>
                    <Button
                      onClick={() =>
                        overtimeDecision.mutate({ shiftId: card.attendance_shift_id, decision: "approve" })
                      }
                    >
                      Принять переработку
                    </Button>
                    <Button
                      onClick={() =>
                        overtimeDecision.mutate({ shiftId: card.attendance_shift_id, decision: "reject" })
                      }
                    >
                      Не принимать переработку
                    </Button>
                  </>
                )}
                <Button onClick={() => startEdit(card)}>Исправить время</Button>
                {card.status === "open" && <Button onClick={() => openClose(card)}>Закрыть смену</Button>}
              </Space>
            )}

            {(editsQuery.data?.length ?? 0) > 0 && (
              <div>
                <Typography.Title level={5}>История правок</Typography.Title>
                <Timeline
                  items={editsQuery.data!.map((e) => ({
                    children: (
                      <div>
                        <div>
                          {fmtDateTime(e.edited_at)} · {e.edited_by_name ?? "—"}
                        </div>
                        <div>
                          {e.field}: {e.old_value ?? "—"} → {e.new_value ?? "—"}
                        </div>
                        <Typography.Text type="secondary">Причина: {e.reason}</Typography.Text>
                      </div>
                    ),
                  }))}
                />
              </div>
            )}
          </Space>
        )}

        {card && editing && (
          <Form form={editForm} layout="vertical" onFinish={(v) => saveEdit.mutate(v)}>
            <Form.Item name="work_location_id" label="Локация">
              <Select allowClear options={locOptions} showSearch optionFilterProp="label" />
            </Form.Item>
            <Form.Item name="clock_in_at" label="Приход" rules={[{ required: true, message: "Обязательное поле" }]}>
              <DatePicker showTime format="DD.MM.YYYY HH:mm" style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="clock_out_at" label="Уход (пусто — смена открыта)">
              <DatePicker showTime format="DD.MM.YYYY HH:mm" style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item
              name="reason"
              label="Причина правки"
              rules={[{ required: true, min: 3, whitespace: true, message: "Укажите причину" }]}
            >
              <Input.TextArea rows={2} maxLength={512} placeholder="Например: забыл отметить уход, подтвердил начальник цеха" />
            </Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={saveEdit.isPending}>
                Сохранить
              </Button>
              <Button onClick={() => setEditing(false)}>Отмена</Button>
            </Space>
          </Form>
        )}
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
          <Form.Item name="clock_out_at" label="Время ухода" rules={[{ required: true, message: "Обязательное поле" }]}>
            <DatePicker showTime format="DD.MM.YYYY HH:mm" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="reason"
            label="Причина"
            rules={[{ required: true, min: 3, whitespace: true, message: "Укажите причину" }]}
          >
            <Input.TextArea rows={2} maxLength={512} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Отклонить отметку"
        open={rejecting != null}
        onCancel={() => setRejecting(null)}
        okText="Отклонить"
        okButtonProps={{ danger: true }}
        cancelText="Отмена"
        confirmLoading={markDecision.isPending}
        onOk={() =>
          rejecting &&
          markDecision.mutate({ mark: rejecting, decision: "reject", comment: rejectComment.trim() || undefined })
        }
      >
        <Typography.Paragraph>
          Отклонённая отметка не идёт в табель. Сотрудник увидит решение и комментарий.
        </Typography.Paragraph>
        <Input.TextArea
          rows={3}
          maxLength={512}
          placeholder="Комментарий для сотрудника"
          value={rejectComment}
          onChange={(e) => setRejectComment(e.target.value)}
        />
      </Modal>

      <Modal
        title="Разобрать неявку"
        open={resolving != null}
        onCancel={() => setResolving(null)}
        footer={
          <Space>
            <Button onClick={() => setResolving(null)}>Отмена</Button>
            <Button
              danger
              loading={absenceDecision.isPending}
              onClick={() =>
                resolving &&
                absenceDecision.mutate({
                  id: resolving.absence_id,
                  resolution: "unexcused",
                  comment: resolveComment.trim() || undefined,
                })
              }
            >
              Прогул
            </Button>
            <Button
              type="primary"
              loading={absenceDecision.isPending}
              onClick={() =>
                resolving &&
                absenceDecision.mutate({
                  id: resolving.absence_id,
                  resolution: "excused",
                  comment: resolveComment.trim() || undefined,
                })
              }
            >
              Уважительная
            </Button>
          </Space>
        }
      >
        <Typography.Paragraph>
          {resolving?.employee_name}: смена {resolving ? fmtDate(resolving.work_date) : ""} c{" "}
          {resolving ? time(resolving.scheduled_start) : ""}, прихода не было.
        </Typography.Paragraph>
        <Input.TextArea
          rows={2}
          maxLength={512}
          placeholder="Комментарий (например: справка, отгул по согласованию)"
          value={resolveComment}
          onChange={(e) => setResolveComment(e.target.value)}
        />
      </Modal>
    </div>
  );
}
