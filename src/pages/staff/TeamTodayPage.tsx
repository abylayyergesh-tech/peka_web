/** «Сегодня по цехам»: табло дня для HR — то же, что руководитель цеха видит
 * в приложении («Мой цех»), но по любому цеху или по всем сразу.
 *
 * Кто на смене и кто опоздал, кого нет, спорные отметки, новички без
 * инструктажа на рабочем месте, запросы на смену телефона, переработки и
 * заявления на согласование. Решения принимаются прямо здесь. */
import { App, Badge, Button, Card, Col, DatePicker, Empty, Image, Input, Modal, Popconfirm, Row, Select, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { decideMark, decideOvertime, resolveAbsence } from "@/api/attendance";
import { errorMessage } from "@/api/client";
import { ONBOARDING_STEP_LABELS } from "@/api/onboarding";
import { decideDeviceRequest, listDepartments } from "@/api/staff";
import {
  confirmWorkplaceBriefing,
  getTeamOverview,
  type TeamAbsent,
  type TeamDispute,
  type TeamOverview,
  type TeamPerson,
} from "@/api/team";
import { useCan } from "@/auth/store";
import { fmtDate, fmtDateTime } from "@/components/format";
import { DISPUTE_REASON_LABELS, fmtDuration } from "@/pages/staff/shared";

function time(v: string | null): string {
  return v ? dayjs(v).format("HH:mm") : "—";
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <Card size="small">
      <Typography.Text type="secondary">{label}</Typography.Text>
      <div style={{ fontSize: 28, fontWeight: 600, color }}>{value}</div>
    </Card>
  );
}

export default function TeamTodayPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canAttendance = useCan("attendance.manage");
  const canStaff = useCan("staff.manage");
  const [day, setDay] = useState<Dayjs>(dayjs());
  const [departmentId, setDepartmentId] = useState<number | undefined>();
  const [rejecting, setRejecting] = useState<TeamDispute | null>(null);
  const [resolving, setResolving] = useState<TeamAbsent | null>(null);
  const [comment, setComment] = useState("");

  const params = { date: day.format("YYYY-MM-DD"), department_id: departmentId };
  const query = useQuery({
    queryKey: ["team-overview", params],
    queryFn: () => getTeamOverview(params),
    refetchInterval: 60_000,
  });
  const departments = useQuery({
    queryKey: ["departments", "options"],
    queryFn: () => listDepartments({ limit: 200, offset: 0 }),
    staleTime: 60_000,
  });

  function done(text: string) {
    message.success(text);
    setRejecting(null);
    setResolving(null);
    queryClient.invalidateQueries({ queryKey: ["team-overview"] });
    queryClient.invalidateQueries({ queryKey: ["shifts"] });
  }
  const onError = (e: unknown) => message.error(errorMessage(e));

  const markM = useMutation({
    mutationFn: (v: { id: number; decision: "accept" | "reject"; comment?: string }) =>
      decideMark(v.id, v.decision, v.comment),
    onSuccess: (_, v) => done(v.decision === "accept" ? "Отметка принята" : "Отметка отклонена"),
    onError,
  });
  const absenceM = useMutation({
    mutationFn: (v: { id: number; resolution: "excused" | "unexcused"; comment?: string }) =>
      resolveAbsence(v.id, v.resolution, v.comment),
    onSuccess: () => done("Неявка разобрана"),
    onError,
  });
  const briefingM = useMutation({
    mutationFn: (employeeId: number) => confirmWorkplaceBriefing(employeeId),
    onSuccess: () => done("Инструктаж на рабочем месте отмечен"),
    onError,
  });
  const deviceM = useMutation({
    mutationFn: (v: { id: number; decision: "approve" | "reject" }) =>
      decideDeviceRequest(v.id, v.decision),
    onSuccess: (_, v) => done(v.decision === "approve" ? "Новый телефон подтверждён" : "Запрос отклонён"),
    onError,
  });
  const overtimeM = useMutation({
    mutationFn: (v: { id: number; decision: "approve" | "reject" }) => decideOvertime(v.id, v.decision),
    onSuccess: (_, v) => done(v.decision === "approve" ? "Переработка принята" : "Переработка не принята"),
    onError,
  });

  const ov: TeamOverview | undefined = query.data;

  const personColumns: ColumnsType<TeamPerson> = [
    { title: "Сотрудник", dataIndex: "full_name" },
    { title: "Цех", dataIndex: "workshop_name", render: (v) => v || "—" },
    { title: "Смена с", dataIndex: "scheduled_start", render: (v) => time(v), width: 90 },
    { title: "Пришёл", dataIndex: "clock_in_at", render: (v) => time(v), width: 90 },
    {
      title: "",
      dataIndex: "late_minutes",
      width: 150,
      render: (v: number | null) => ((v ?? 0) > 0 ? <Tag color="red">опоздание {v} мин</Tag> : null),
    },
  ];

  return (
    <div>
      <Space style={{ justifyContent: "space-between", width: "100%" }} align="baseline">
        <h2 style={{ marginTop: 0 }}>Сегодня по цехам</h2>
        <Link to="/attendance">Все отметки →</Link>
      </Space>
      <Typography.Paragraph type="secondary">
        То же табло, что руководитель цеха видит в приложении («Мой цех»). Обновляется само раз в минуту.
      </Typography.Paragraph>
      <Space style={{ marginBottom: 16 }} wrap>
        <DatePicker value={day} allowClear={false} format="DD.MM.YYYY" onChange={(v) => v && setDay(v)} />
        <Select
          allowClear
          style={{ width: 240 }}
          placeholder="Все цеха"
          value={departmentId}
          onChange={setDepartmentId}
          options={(departments.data?.items ?? [])
            .filter((d) => d.is_active)
            .map((d) => ({ value: d.department_id, label: d.name }))}
        />
      </Space>

      {ov && (
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={12} md={6}><Stat label="На смене" value={ov.on_shift.length} color="#389e0d" /></Col>
          <Col xs={12} md={6}><Stat label="Опоздали" value={ov.late.length} color="#cf1322" /></Col>
          <Col xs={12} md={6}><Stat label="Нет на месте" value={ov.absent.length} color="#d46b08" /></Col>
          <Col xs={12} md={6}><Stat label="Спорные отметки" value={ov.disputed.length} color="#d48806" /></Col>
        </Row>
      )}

      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Card size="small" title="На смене" loading={query.isPending}>
          <Table rowKey="employee_id" size="small" pagination={false} dataSource={ov?.on_shift}
            columns={personColumns} locale={{ emptyText: "Никого" }} />
        </Card>

        <Card size="small" title="Опоздали">
          <Table rowKey="employee_id" size="small" pagination={false} dataSource={ov?.late}
            columns={personColumns} locale={{ emptyText: "Никто не опоздал" }} />
        </Card>

        <Card size="small" title="Нет на месте">
          <Table<TeamAbsent>
            rowKey="employee_id"
            size="small"
            pagination={false}
            dataSource={ov?.absent}
            locale={{ emptyText: "Все пришли" }}
            columns={[
              { title: "Сотрудник", dataIndex: "full_name" },
              { title: "Смена с", dataIndex: "scheduled_start", render: (v) => time(v), width: 90 },
              {
                title: "Статус",
                dataIndex: "status",
                width: 160,
                render: (v: string) =>
                  v === "no_show" ? <Tag color="orange">неявка</Tag> : <Tag>ещё не пришёл</Tag>,
              },
              {
                title: "",
                key: "act",
                width: 120,
                render: (_, r) =>
                  canAttendance && r.absence_id ? (
                    <a onClick={() => { setComment(""); setResolving(r); }}>Разобрать</a>
                  ) : null,
              },
            ]}
          />
        </Card>

        <Card size="small" title={<Badge count={ov?.disputed.length ?? 0} offset={[12, 0]}>Спорные отметки</Badge>}>
          {(ov?.disputed.length ?? 0) === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Спорных нет" />
          ) : (
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              {ov!.disputed.map((d) => (
                <div key={d.mark_id} style={{ display: "flex", gap: 12 }}>
                  <Space direction="vertical" size={2} align="center">
                    {d.photo_url ? (
                      <Image src={d.photo_url} width={72} height={96} style={{ objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: 72, height: 96, background: "#f5f5f5" }} />
                    )}
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>селфи</Typography.Text>
                  </Space>
                  {d.reference_photo_url && (
                    // Эталон из онбординга — сверить, тот ли человек на селфи.
                    <Space direction="vertical" size={2} align="center">
                      <Image src={d.reference_photo_url} width={72} height={96} style={{ objectFit: "cover" }} />
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>эталон</Typography.Text>
                    </Space>
                  )}
                  <div style={{ flex: 1 }}>
                    <Typography.Text strong>{d.full_name}</Typography.Text>{" "}
                    · {d.kind === "clock_in" ? "приход" : "уход"} {fmtDateTime(d.marked_at)}
                    <div>
                      {d.reasons.map((r) => <Tag key={r}>{DISPUTE_REASON_LABELS[r] ?? r}</Tag>)}
                      {d.distance_m != null && <span>{d.distance_m} м от {d.work_location_name ?? "площадки"}</span>}
                      {d.latitude && d.longitude && (
                        <>
                          {" · "}
                          <a target="_blank" rel="noreferrer"
                            href={`https://www.google.com/maps/search/?api=1&query=${d.latitude},${d.longitude}`}>
                            на карте
                          </a>
                        </>
                      )}
                    </div>
                    {d.comment && <div>«{d.comment}»</div>}
                    {canAttendance && (
                      <Space style={{ marginTop: 6 }}>
                        <Button size="small" type="primary" loading={markM.isPending}
                          onClick={() => markM.mutate({ id: d.mark_id, decision: "accept" })}>
                          Принять
                        </Button>
                        <Button size="small" danger onClick={() => { setComment(""); setRejecting(d); }}>
                          Отклонить
                        </Button>
                      </Space>
                    )}
                  </div>
                </div>
              ))}
            </Space>
          )}
        </Card>

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card size="small" title="Новички без инструктажа на рабочем месте">
              <Table
                rowKey="employee_id"
                size="small"
                pagination={false}
                dataSource={ov?.newcomers}
                locale={{ emptyText: "Нет" }}
                columns={[
                  { title: "Сотрудник", dataIndex: "full_name" },
                  { title: "Принят", dataIndex: "hired_at", render: (v) => fmtDate(v), width: 100 },
                  { title: "Первая смена", dataIndex: "first_shift_date", render: (v) => fmtDate(v), width: 120 },
                  {
                    title: "",
                    key: "act",
                    width: 150,
                    render: (_, r) =>
                      canStaff ? (
                        <Popconfirm title="Инструктаж на рабочем месте проведён?" okText="Да" cancelText="Нет"
                          onConfirm={() => briefingM.mutate(r.employee_id)}>
                          <a>Инструктаж проведён</a>
                        </Popconfirm>
                      ) : null,
                  },
                ]}
              />
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card size="small" title="Смена телефона">
              <Table
                rowKey="request_id"
                size="small"
                pagination={false}
                dataSource={ov?.device_requests}
                locale={{ emptyText: "Запросов нет" }}
                columns={[
                  { title: "Сотрудник", dataIndex: "full_name" },
                  { title: "Телефон", dataIndex: "device_model", render: (v) => v || "—" },
                  { title: "Когда", dataIndex: "requested_at", render: (v) => fmtDateTime(v), width: 130 },
                  {
                    title: "",
                    key: "act",
                    width: 170,
                    render: (_, r) =>
                      canStaff ? (
                        <Space>
                          <Popconfirm title="Подтвердить новый телефон?" description="Старый сразу перестанет работать."
                            okText="Подтвердить" cancelText="Отмена"
                            onConfirm={() => deviceM.mutate({ id: r.request_id, decision: "approve" })}>
                            <a>Подтвердить</a>
                          </Popconfirm>
                          <a onClick={() => deviceM.mutate({ id: r.request_id, decision: "reject" })}>Отклонить</a>
                        </Space>
                      ) : null,
                  },
                ]}
              />
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card size="small" title="Переработки на подтверждение">
              <Table
                rowKey="attendance_shift_id"
                size="small"
                pagination={false}
                dataSource={ov?.overtime}
                locale={{ emptyText: "Нет" }}
                columns={[
                  { title: "Сотрудник", dataIndex: "full_name" },
                  { title: "День", dataIndex: "date", render: (v) => fmtDate(v), width: 100 },
                  { title: "Сверх смены", dataIndex: "overtime_minutes", render: (v) => fmtDuration(v), width: 110 },
                  {
                    title: "",
                    key: "act",
                    width: 170,
                    render: (_, r) =>
                      canAttendance ? (
                        <Space>
                          <a onClick={() => overtimeM.mutate({ id: r.attendance_shift_id, decision: "approve" })}>Принять</a>
                          <a onClick={() => overtimeM.mutate({ id: r.attendance_shift_id, decision: "reject" })}>Не принимать</a>
                        </Space>
                      ) : null,
                  },
                ]}
              />
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card size="small" title="Не прошли онбординг" extra={<Link to="/onboarding">Онбординг →</Link>}>
              <Table
                rowKey="employee_id"
                size="small"
                pagination={false}
                dataSource={ov?.onboarding_pending}
                locale={{ emptyText: "Все прошли (или онбординг не запущен)" }}
                columns={[
                  { title: "Сотрудник", dataIndex: "full_name" },
                  {
                    title: "Шаг",
                    dataIndex: "onboarding_step",
                    width: 140,
                    render: (v: string | null) => ONBOARDING_STEP_LABELS[v ?? ""] ?? "не начинал",
                  },
                  {
                    title: "Отметка",
                    dataIndex: "grace_until",
                    width: 150,
                    render: (v: string | null) =>
                      v && dayjs(v).isAfter(dayjs())
                        ? <Tag color="gold">открыта до {fmtDate(v)}</Tag>
                        : <Tag color="red">закрыта</Tag>,
                  },
                ]}
              />
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card size="small" title="Заявления">
              <Typography.Paragraph>
                На вашем согласовании: <b>{ov?.requests_pending ?? 0}</b>
              </Typography.Paragraph>
              <Link to="/requests">Открыть «Заявления» →</Link>
            </Card>
          </Col>
        </Row>
      </Space>

      <Modal title="Отклонить отметку" open={rejecting != null} onCancel={() => setRejecting(null)}
        okText="Отклонить" okButtonProps={{ danger: true }} cancelText="Отмена" confirmLoading={markM.isPending}
        onOk={() => rejecting && markM.mutate({ id: rejecting.mark_id, decision: "reject", comment: comment.trim() || undefined })}>
        <Typography.Paragraph>Отклонённая отметка не идёт в табель. Сотрудник увидит решение и комментарий.</Typography.Paragraph>
        <Input.TextArea rows={3} maxLength={512} placeholder="Комментарий для сотрудника" value={comment}
          onChange={(e) => setComment(e.target.value)} />
      </Modal>

      <Modal title="Разобрать неявку" open={resolving != null} onCancel={() => setResolving(null)}
        footer={
          <Space>
            <Button onClick={() => setResolving(null)}>Отмена</Button>
            <Button danger loading={absenceM.isPending}
              onClick={() => resolving?.absence_id && absenceM.mutate({ id: resolving.absence_id, resolution: "unexcused", comment: comment.trim() || undefined })}>
              Прогул
            </Button>
            <Button type="primary" loading={absenceM.isPending}
              onClick={() => resolving?.absence_id && absenceM.mutate({ id: resolving.absence_id, resolution: "excused", comment: comment.trim() || undefined })}>
              Уважительная
            </Button>
          </Space>
        }>
        <Typography.Paragraph>{resolving?.full_name}: смена с {resolving ? time(resolving.scheduled_start) : ""}, прихода не было.</Typography.Paragraph>
        <Input.TextArea rows={2} maxLength={512} placeholder="Комментарий (например: справка)" value={comment}
          onChange={(e) => setComment(e.target.value)} />
      </Modal>
    </div>
  );
}
