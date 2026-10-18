/** Инструктаж: содержание (черновик правится, опубликованная версия — только
 * смотрится), версии и кто проходит.
 *
 * Публикация черновика: прошедшим прежнюю версию назначается новая, а у тех,
 * кто ещё не прошёл прежнюю, назначение переезжает на новую. */
import {
  Alert, App, Button, Drawer, Form, Input, Modal, Popconfirm, Segmented, Select, Space, Spin, Switch,
  Table, Tabs, Tag, Typography,
} from "antd";
import { ArrowLeftOutlined, SettingOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  ASSIGNMENT_REASON_LABELS,
  ASSIGNMENT_STATUS_LABELS,
  deleteBriefingVersion,
  getBriefing,
  getBriefingVersion,
  listBriefingAssignments,
  newBriefingVersion,
  publishBriefingVersion,
  repeatBriefing,
  saveBriefingVersion,
  updateBriefing,
  type AssignmentFilter,
  type BriefingAssignment,
  type BriefingDetail,
  type BriefingVersionSummary,
} from "@/api/onboarding";
import { useCan } from "@/auth/store";
import { fmtDate, fmtDateTime } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import { useTabParam } from "@/components/useTabParam";
import { AudienceTags, useAudienceOptions } from "@/pages/staff/BriefingsPage";
import { DraftEditor, VersionView, type DraftValues } from "@/pages/staff/BriefingEditor";

export function AssignmentStatusTag({ a }: { a: Pick<BriefingAssignment, "status" | "overdue" | "failed_streak"> }) {
  const color = a.status === "confirmed" ? "green" : a.status === "passed" ? "blue" : undefined;
  return (
    <Space size={4} wrap>
      <Tag color={color}>{ASSIGNMENT_STATUS_LABELS[a.status] ?? a.status}</Tag>
      {a.overdue && <Tag color="red">просрочен</Tag>}
      {a.failed_streak >= 3 && <Tag color="volcano">не сдаёт тест: {a.failed_streak} раза подряд</Tag>}
    </Space>
  );
}

export const ASSIGNMENT_FILTERS: { value: AssignmentFilter; label: string }[] = [
  { value: "open", label: "Не подписали" },
  { value: "overdue", label: "Просрочено" },
  { value: "failing", label: "Не сдают тест" },
  { value: "confirmed", label: "Подписали" },
  { value: "all", label: "Все" },
];

export function assignmentColumns(opts: { briefing?: boolean; onRepeat?: (a: BriefingAssignment) => void }):
  ColumnsType<BriefingAssignment> {
  return [
    {
      title: "Сотрудник",
      dataIndex: "employee_name",
      render: (v, r) => (
        <Space direction="vertical" size={0}>
          <span>{v}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {[r.position, r.department_name].filter(Boolean).join(" · ") || "—"}
          </Typography.Text>
        </Space>
      ),
    },
    ...(opts.briefing
      ? [{ title: "Инструктаж", dataIndex: "briefing_title",
          render: (v: string, r: BriefingAssignment) => `${v} · в.${r.version_number}` }]
      : [{ title: "Версия", dataIndex: "version_number", width: 80 }]),
    { title: "Вид", dataIndex: "reason", width: 120, render: (v) => ASSIGNMENT_REASON_LABELS[v] ?? v },
    { title: "Статус", key: "st", width: 230, render: (_, r) => <AssignmentStatusTag a={r} /> },
    { title: "Блоки", key: "blocks", width: 80, render: (_, r) => `${r.blocks_passed} / ${r.blocks_total}` },
    {
      title: "Срок",
      dataIndex: "due_date",
      width: 100,
      render: (v: string | null, r) =>
        v ? <Typography.Text type={r.overdue ? "danger" : undefined}>{fmtDate(v)}</Typography.Text> : "—",
    },
    { title: "Подписал", dataIndex: "confirmed_at", width: 140, render: (v) => fmtDateTime(v) },
    {
      title: "",
      key: "act",
      width: 160,
      render: (_, r) => (
        <Space>
          {r.sheet_pdf_url && <a href={r.sheet_pdf_url} target="_blank" rel="noreferrer">Лист (PDF)</a>}
          {opts.onRepeat && r.status === "confirmed" && <a onClick={() => opts.onRepeat?.(r)}>Повторный</a>}
        </Space>
      ),
    },
  ];
}

function SettingsModal({ briefing, open, onClose }: { briefing: BriefingDetail; open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const { departmentOptions, positionOptions } = useAudienceOptions();
  const save = useMutation({
    mutationFn: (v: { title: string; topic?: string; is_active: boolean; department_ids?: number[]; position_ids?: number[] }) =>
      updateBriefing(briefing.briefing_id, {
        title: v.title, topic: v.topic || null, is_active: v.is_active,
        department_ids: v.department_ids ?? [], position_ids: v.position_ids ?? [],
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["briefing", briefing.briefing_id], data);
      queryClient.invalidateQueries({ queryKey: ["briefings"] });
      queryClient.invalidateQueries({ queryKey: ["briefing-assignments"] });
      message.success("Сохранено");
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  return (
    <Modal title="Настройки инструктажа" open={open} onCancel={onClose} okText="Сохранить" cancelText="Отмена"
      confirmLoading={save.isPending} onOk={() => form.submit()} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}
        initialValues={{
          title: briefing.title, topic: briefing.topic, is_active: briefing.is_active,
          department_ids: briefing.department_ids, position_ids: briefing.position_ids,
        }}>
        <Form.Item name="title" label="Название" rules={[{ required: true, message: "Обязательное поле" }]}>
          <Input />
        </Form.Item>
        <Form.Item name="topic" label="О чём (для себя)"><Input.TextArea rows={2} /></Form.Item>
        <Form.Item name="department_ids" label="Цеха" extra="Пусто — все цеха">
          <Select mode="multiple" allowClear options={departmentOptions} optionFilterProp="label" />
        </Form.Item>
        <Form.Item name="position_ids" label="Должности" extra="Пусто — все должности">
          <Select mode="multiple" allowClear options={positionOptions} optionFilterProp="label" />
        </Form.Item>
        <Form.Item name="is_active" label="Действует" valuePropName="checked"
          extra="Выключенный инструктаж не назначается, а непройденные назначения снимаются">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function ContentTab({ briefing }: { briefing: BriefingDetail }) {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("staff.manage");
  const [dirty, setDirty] = useState(false);
  const versionId = briefing.draft_version_id ?? briefing.current_version?.version_id;
  const isDraft = briefing.draft_version_id != null;
  const query = useQuery({
    queryKey: ["briefing-version", versionId],
    queryFn: () => getBriefingVersion(versionId!),
    enabled: versionId != null,
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["briefing", briefing.briefing_id] });
    queryClient.invalidateQueries({ queryKey: ["briefings"] });
    queryClient.invalidateQueries({ queryKey: ["briefing-assignments"] });
  };
  const onError = (e: unknown) => message.error(errorMessage(e));
  const save = useMutation({
    mutationFn: (v: DraftValues) => saveBriefingVersion(versionId!, v),
    onSuccess: (data) => {
      queryClient.setQueryData(["briefing-version", versionId], data);
      refresh();
      message.success("Черновик сохранён");
    },
    onError,
  });
  const publish = useMutation({
    mutationFn: () => publishBriefingVersion(versionId!),
    onSuccess: () => { refresh(); message.success("Версия опубликована и назначена"); },
    onError,
  });
  const drop = useMutation({
    mutationFn: () => deleteBriefingVersion(versionId!),
    onSuccess: () => { refresh(); message.success("Черновик удалён"); },
    onError,
  });
  const fresh = useMutation({
    mutationFn: () => newBriefingVersion(briefing.briefing_id),
    onSuccess: () => { refresh(); message.success("Создан черновик — копия действующей версии"); },
    onError,
  });

  if (versionId == null) return <Spin />;
  if (query.isPending || !query.data) return <Spin />;
  const v = query.data;

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      {isDraft ? (
        <Alert
          type="warning"
          showIcon
          message={`Черновик версии ${v.number}`}
          description={
            <Space direction="vertical">
              <span>
                Сотрудники его не видят. «Опубликовать» назначит версию аудитории
                {briefing.current_version ? ", а прошедшим версию " + briefing.current_version.number + " — заново" : ""}.
              </span>
              {canManage && (
                <Space wrap>
                  <Button
                    type="primary"
                    loading={publish.isPending}
                    onClick={() =>
                      dirty
                        ? message.warning("Сначала сохраните черновик")
                        : modal.confirm({
                            title: `Опубликовать версию ${v.number}?`,
                            content: "Опубликованную версию больше нельзя менять — только выпустить новую.",
                            okText: "Опубликовать",
                            cancelText: "Отмена",
                            onOk: () => publish.mutateAsync(),
                          })
                    }
                  >
                    Опубликовать версию {v.number}
                  </Button>
                  {briefing.current_version && (
                    <Popconfirm title="Удалить черновик?" okText="Удалить" cancelText="Отмена"
                      okButtonProps={{ danger: true }} onConfirm={() => drop.mutate()}>
                      <Button danger loading={drop.isPending}>Удалить черновик</Button>
                    </Popconfirm>
                  )}
                </Space>
              )}
            </Space>
          }
        />
      ) : (
        <Alert
          type="success"
          showIcon
          message={`Действует версия ${v.number} от ${fmtDate(v.published_at)}`}
          description={
            <Space direction="vertical">
              <span>Её не правят: изменения — в новой версии, она начнётся с копии этой.</span>
              {canManage && (
                <Button loading={fresh.isPending} onClick={() => fresh.mutate()}>Новая версия</Button>
              )}
            </Space>
          }
        />
      )}
      {isDraft && canManage ? (
        <DraftEditor version={v} saving={save.isPending} onSave={(d) => save.mutate(d)} onDirty={setDirty} />
      ) : (
        <VersionView version={v} />
      )}
    </Space>
  );
}

function VersionsTab({ briefing }: { briefing: BriefingDetail }) {
  const [open, setOpen] = useState<number | null>(null);
  const version = useQuery({
    queryKey: ["briefing-version", open],
    queryFn: () => getBriefingVersion(open!),
    enabled: open != null,
  });
  const columns: ColumnsType<BriefingVersionSummary> = [
    { title: "№", dataIndex: "number", width: 60 },
    {
      title: "Статус",
      key: "st",
      width: 140,
      render: (_, r) =>
        !r.published_at ? <Tag color="orange">черновик</Tag> : r.archived_at ? <Tag>архив</Tag> : <Tag color="green">действует</Tag>,
    },
    { title: "Опубликована", dataIndex: "published_at", render: (v) => fmtDateTime(v) },
    { title: "Сменена", dataIndex: "archived_at", render: (v) => fmtDateTime(v) },
    { title: "Блоков", dataIndex: "blocks_count", width: 90 },
    { title: "Проходной балл", dataIndex: "pass_percent", width: 140, render: (v) => `${v}%` },
    { title: "Повтор", dataIndex: "repeat_days", width: 120, render: (v) => (v ? `через ${v} дн.` : "—") },
  ];
  return (
    <>
      <Table rowKey="version_id" size="small" pagination={false} dataSource={briefing.versions} columns={columns}
        rowClassName={() => "row-clickable"} onRow={(r) => ({ onClick: () => setOpen(r.version_id) })} />
      <Drawer width={720} open={open != null} onClose={() => setOpen(null)}
        title={version.data ? `Версия ${version.data.number}` : "Версия"}>
        {version.data ? <VersionView version={version.data} /> : <Spin />}
      </Drawer>
    </>
  );
}

function PeopleTab({ briefing }: { briefing: BriefingDetail }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("staff.manage");
  const { limit, offset, tablePagination, reset } = usePagination(50);
  const [status, setStatus] = useState<AssignmentFilter>("open");
  const params = { limit, offset, status, briefing_id: briefing.briefing_id };
  const query = useQuery({
    queryKey: ["briefing-assignments", params],
    queryFn: () => listBriefingAssignments(params),
  });
  const repeat = useMutation({
    mutationFn: (employeeIds?: number[]) => repeatBriefing(briefing.briefing_id, employeeIds),
    onSuccess: (r) => {
      message.success(r.assigned ? `Назначено: ${r.assigned}` : "Назначать некому: у всех уже есть непройденный");
      queryClient.invalidateQueries({ queryKey: ["briefing-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["briefing", briefing.briefing_id] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  return (
    <>
      <Space wrap style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <Segmented value={status} options={ASSIGNMENT_FILTERS}
          onChange={(v) => { setStatus(v as AssignmentFilter); reset(); }} />
        {canManage && briefing.current_version && (
          <Popconfirm
            title="Назначить повторный инструктаж всей аудитории?"
            description="Тем, у кого уже есть непройденный, повтор не добавится."
            okText="Назначить"
            cancelText="Отмена"
            onConfirm={() => repeat.mutate(undefined)}
          >
            <Button loading={repeat.isPending}>Повторный всем</Button>
          </Popconfirm>
        )}
      </Space>
      <Table
        rowKey="assignment_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        columns={assignmentColumns({
          onRepeat: canManage ? (a) => repeat.mutate([a.employee_id]) : undefined,
        })}
        pagination={tablePagination(query.data?.total)}
        scroll={{ x: 1000 }}
        locale={{ emptyText: "Никого" }}
      />
    </>
  );
}

export default function BriefingDetailPage() {
  const { id } = useParams();
  const briefingId = Number(id);
  const navigate = useNavigate();
  const canManage = useCan("staff.manage");
  const [tab, setTab] = useTabParam("content", ["content", "versions", "people"]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const query = useQuery({ queryKey: ["briefing", briefingId], queryFn: () => getBriefing(briefingId) });
  const b = query.data;

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/briefings")}>Инструктажи</Button>
      </Space>
      {!b ? (
        <Spin />
      ) : (
        <>
          <Space style={{ justifyContent: "space-between", width: "100%" }} align="start">
            <div>
              <h2 style={{ margin: 0 }}>
                {b.title} {!b.is_active && <Tag>выключен</Tag>}
              </h2>
              {b.topic && <Typography.Text type="secondary">{b.topic}</Typography.Text>}
              <div style={{ marginTop: 6 }}>Кому: <AudienceTags b={b} /></div>
              <Typography.Text type="secondary">
                Не подписали: {b.open_count}
                {b.overdue_count ? `, из них просрочено ${b.overdue_count}` : ""} · подписали действующую версию: {b.confirmed_count}
              </Typography.Text>
            </div>
            {canManage && (
              <Button icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)}>Настройки</Button>
            )}
          </Space>
          <Tabs
            style={{ marginTop: 12 }}
            activeKey={tab}
            onChange={setTab}
            items={[
              { key: "content", label: "Содержание", children: <ContentTab briefing={b} /> },
              { key: "versions", label: `Версии (${b.versions.length})`, children: <VersionsTab briefing={b} /> },
              { key: "people", label: "Кто проходит", children: <PeopleTab briefing={b} /> },
            ]}
          />
          {settingsOpen && <SettingsModal briefing={b} open onClose={() => setSettingsOpen(false)} />}
        </>
      )}
    </div>
  );
}
