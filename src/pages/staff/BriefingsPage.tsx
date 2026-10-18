/** «Инструктажи по ТБ»: список инструктажей организации (ТЗ, §7).
 *
 * Инструктаж — блоки с материалами и тестом. Кому он: цеха и должности
 * (пусто — всем). Назначается сам: при публикации версии, при смене
 * аудитории и когда сотрудник открывает приложение. Опубликованную версию не
 * правят — делают новую, и прошедшим старую назначается новая. */
import { App, Button, Form, Input, Modal, Select, Space, Switch, Table, Tag, Typography } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";

import { listPositions } from "@/api/admin";
import { errorMessage } from "@/api/client";
import { createBriefing, listBriefings, type Briefing } from "@/api/onboarding";
import { listDepartments } from "@/api/staff";
import { useCan } from "@/auth/store";
import { fmtDate } from "@/components/format";

export function AudienceTags({ b }: { b: Pick<Briefing, "departments" | "positions"> }) {
  if (!b.departments.length && !b.positions.length) return <Tag>все сотрудники</Tag>;
  return (
    <Space size={[4, 4]} wrap>
      {b.departments.map((d) => <Tag key={`d${d.id}`} color="blue">{d.name}</Tag>)}
      {b.positions.map((p) => <Tag key={`p${p.id}`} color="purple">{p.name}</Tag>)}
    </Space>
  );
}

export function useAudienceOptions() {
  const departments = useQuery({
    queryKey: ["departments", "options"],
    queryFn: () => listDepartments({ limit: 200, offset: 0 }),
    staleTime: 60_000,
  });
  const positions = useQuery({
    queryKey: ["positions", "options"],
    queryFn: () => listPositions(),
    staleTime: 60_000,
  });
  return {
    departmentOptions: (departments.data?.items ?? []).filter((d) => d.is_active)
      .map((d) => ({ value: d.department_id, label: d.name })),
    positionOptions: (positions.data ?? []).map((p) => ({ value: p.position_id, label: p.name })),
  };
}

interface CreateValues {
  title: string;
  topic?: string;
  department_ids?: number[];
  position_ids?: number[];
}

export default function BriefingsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const canManage = useCan("staff.manage");
  const [showInactive, setShowInactive] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm<CreateValues>();
  const { departmentOptions, positionOptions } = useAudienceOptions();

  const query = useQuery({
    queryKey: ["briefings", showInactive],
    queryFn: () => listBriefings(showInactive),
  });
  const create = useMutation({
    mutationFn: (v: CreateValues) => createBriefing({
      title: v.title, topic: v.topic || null,
      department_ids: v.department_ids ?? [], position_ids: v.position_ids ?? [],
    }),
    onSuccess: (b) => {
      message.success("Инструктаж создан — заполните черновик версии 1");
      navigate(`/briefings/${b.briefing_id}`);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const columns: ColumnsType<Briefing> = [
    {
      title: "Инструктаж",
      dataIndex: "title",
      render: (v: string, r) => (
        <Space direction="vertical" size={0}>
          <span>{v} {!r.is_active && <Tag>выключен</Tag>}</span>
          {r.topic && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{r.topic}</Typography.Text>}
        </Space>
      ),
    },
    { title: "Кому", key: "aud", render: (_, r) => <AudienceTags b={r} /> },
    {
      title: "Версия",
      key: "version",
      width: 190,
      render: (_, r) => (
        <Space size={4} wrap>
          {r.current_version ? (
            <span>№{r.current_version.number} от {fmtDate(r.current_version.published_at)}</span>
          ) : (
            <Tag color="orange">не опубликован</Tag>
          )}
          {r.draft_version_id && r.current_version && <Tag>есть черновик</Tag>}
        </Space>
      ),
    },
    { title: "Не подписали", dataIndex: "open_count", width: 120,
      render: (v: number, r) => (
        <Space size={4}>
          <span>{v}</span>
          {r.overdue_count > 0 && <Tag color="red">просрочено {r.overdue_count}</Tag>}
        </Space>
      ) },
    { title: "Подписали", dataIndex: "confirmed_count", width: 100 },
    {
      title: "Повтор",
      key: "repeat",
      width: 110,
      render: (_, r) => (r.current_version?.repeat_days ? `раз в ${r.current_version.repeat_days} дн.` : "—"),
    },
  ];

  return (
    <div>
      <Space style={{ justifyContent: "space-between", width: "100%", marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Инструктажи по ТБ</h2>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setCreating(true); }}>
            Новый инструктаж
          </Button>
        )}
      </Space>
      <Typography.Paragraph type="secondary">
        Сотрудник проходит инструктаж в приложении: читает материалы, сдаёт тест по каждому блоку и
        подписывает паролем. Подписанное попадает в «Журнал инструктажей» с листом ознакомления.
      </Typography.Paragraph>
      <Space style={{ marginBottom: 16 }}>
        <Switch checked={showInactive} onChange={setShowInactive} />
        <span>Показывать выключенные</span>
      </Space>
      <Table
        rowKey="briefing_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data}
        columns={columns}
        pagination={false}
        rowClassName={() => "row-clickable"}
        onRow={(r) => ({ onClick: () => navigate(`/briefings/${r.briefing_id}`) })}
        locale={{ emptyText: "Инструктажей ещё нет" }}
      />

      <Modal
        title="Новый инструктаж"
        open={creating}
        okText="Создать"
        cancelText="Отмена"
        confirmLoading={create.isPending}
        onCancel={() => setCreating(false)}
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => create.mutate(v)}>
          <Form.Item name="title" label="Название" rules={[{ required: true, message: "Обязательное поле" }]}>
            <Input placeholder="Охрана труда в цехе" />
          </Form.Item>
          <Form.Item name="topic" label="О чём (для себя)">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="department_ids" label="Цеха" extra="Пусто — все цеха">
            <Select mode="multiple" allowClear options={departmentOptions} optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="position_ids" label="Должности"
            extra="Пусто — все должности. Заданы и цеха, и должности — нужно совпасть по обоим">
            <Select mode="multiple" allowClear options={positionOptions} optionFilterProp="label" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
