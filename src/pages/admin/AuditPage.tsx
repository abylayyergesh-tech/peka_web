/** Журнал действий организации (audit_events, нужен member.manage). */
import { App, Select, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { listAuditEvents, type AuditEventOut } from "@/api/audit";
import { errorMessage } from "@/api/client";
import { fmtDateTime } from "@/components/format";
import { usePagination } from "@/components/usePagination";

/** Русские подписи известных действий; неизвестные показываем как есть. */
const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  "auth.register": { label: "Регистрация", color: "blue" },
  "auth.login_success": { label: "Вход", color: "green" },
  "auth.login_failed": { label: "Неудачный вход", color: "red" },
  "auth.logout": { label: "Выход", color: "default" },
  "auth.password_reset_requested": { label: "Запрошен сброс пароля", color: "orange" },
  "auth.password_reset_completed": { label: "Пароль сброшен", color: "orange" },
  "auth.password_changed": { label: "Пароль изменён", color: "orange" },
  "invite.created": { label: "Приглашение создано", color: "blue" },
  "invite.accepted": { label: "Приглашение принято", color: "green" },
  "invite.revoked": { label: "Приглашение отозвано", color: "default" },
  "member.added": { label: "Участник добавлен", color: "blue" },
  "member.role_changed": { label: "Роль изменена", color: "geekblue" },
  "member.removed": { label: "Участник удалён", color: "volcano" },
};

export default function AuditPage() {
  const { message } = App.useApp();
  const { limit, offset, tablePagination } = usePagination();
  const [action, setAction] = useState<string | undefined>(undefined);

  const query = useQuery({
    queryKey: ["audit-events", { limit, offset, action }],
    queryFn: () => listAuditEvents({ limit, offset, action }),
  });
  if (query.isError) message.error(errorMessage(query.error));

  const columns: ColumnsType<AuditEventOut> = [
    {
      title: "Когда",
      dataIndex: "created_at",
      width: 165,
      render: (v: string) => fmtDateTime(v),
    },
    {
      title: "Действие",
      dataIndex: "action",
      width: 220,
      render: (v: string) => {
        const a = ACTION_LABELS[v];
        return a ? <Tag color={a.color}>{a.label}</Tag> : <Tag>{v}</Tag>;
      },
    },
    { title: "Пользователь", dataIndex: "user_id", width: 120, render: (v) => v ?? "—" },
    {
      title: "Объект",
      width: 150,
      render: (_, row) =>
        row.entity_type ? `${row.entity_type} #${row.entity_id ?? "?"}` : "—",
    },
    {
      title: "Детали",
      dataIndex: "details",
      render: (v: Record<string, unknown> | null) =>
        v && Object.keys(v).length > 0 ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {Object.entries(v)
              .map(([k, val]) => `${k}: ${String(val)}`)
              .join(" · ")}
          </Typography.Text>
        ) : (
          "—"
        ),
    },
    { title: "IP", dataIndex: "ip", width: 130, render: (v) => v ?? "—" },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <h2 style={{ margin: 0 }}>Журнал действий</h2>
        <Select
          style={{ minWidth: 260 }}
          allowClear
          placeholder="Все действия"
          value={action}
          onChange={setAction}
          options={Object.entries(ACTION_LABELS).map(([value, a]) => ({
            value,
            label: a.label,
          }))}
        />
      </Space>
      <Table
        rowKey="id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        pagination={tablePagination(query.data?.total)}
        columns={columns}
      />
    </div>
  );
}
