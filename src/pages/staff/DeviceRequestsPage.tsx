/** «Смена телефона»: входы с новых телефонов, которые ждут решения.
 *
 * Правило ТЗ — «один аккаунт — один телефон». Руководитель цеха решает такие
 * запросы в приложении («Мой цех»), HR — здесь, за любого сотрудника.
 * Подтверждённый телефон становится привязанным, старый отрезается сразу. */
import { App, Button, Input, Modal, Popconfirm, Space, Table, Tabs, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  decideDeviceRequest,
  listDeviceRequests,
  type DeviceRequestOut,
  type DeviceRequestStatus,
} from "@/api/staff";
import { useCan } from "@/auth/store";
import { fmtDateTime } from "@/components/format";
import { deviceLabel } from "@/pages/staff/AppAccessTab";

const TABS: { key: DeviceRequestStatus; label: string }[] = [
  { key: "pending", label: "Ждут решения" },
  { key: "approved", label: "Подтверждены" },
  { key: "rejected", label: "Отклонены" },
  { key: "cancelled", label: "Сняты сбросом" },
];

export default function DeviceRequestsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("staff.manage");
  const [status, setStatus] = useState<DeviceRequestStatus>("pending");
  const [rejecting, setRejecting] = useState<DeviceRequestOut | null>(null);
  const [comment, setComment] = useState("");

  const query = useQuery({
    queryKey: ["device-requests", status],
    queryFn: () => listDeviceRequests(status),
  });

  const decide = useMutation({
    mutationFn: (v: { id: number; decision: "approve" | "reject"; comment?: string }) =>
      decideDeviceRequest(v.id, v.decision, v.comment),
    onSuccess: (_, v) => {
      message.success(v.decision === "approve" ? "Новый телефон подтверждён" : "Запрос отклонён");
      setRejecting(null);
      queryClient.invalidateQueries({ queryKey: ["device-requests"] });
      queryClient.invalidateQueries({ queryKey: ["employee-devices"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const columns: ColumnsType<DeviceRequestOut> = [
    { title: "Сотрудник", dataIndex: "full_name", render: (v) => v || "—" },
    { title: "Цех", dataIndex: "department_name", render: (v) => v || "—" },
    { title: "Новый телефон", render: (_, r) => deviceLabel(r) },
    {
      title: "Сейчас привязан",
      dataIndex: "current_device_model",
      render: (v) => v || "—",
    },
    { title: "Когда", dataIndex: "requested_at", render: (v) => fmtDateTime(v), width: 150 },
  ];
  if (status === "pending" && canManage) {
    columns.push({
      title: "",
      key: "actions",
      width: 230,
      render: (_, r) => (
        <Space>
          <Popconfirm
            title="Подтвердить новый телефон?"
            description="Старый телефон сразу перестанет работать."
            okText="Подтвердить"
            cancelText="Отмена"
            onConfirm={() => decide.mutate({ id: r.request_id, decision: "approve" })}
          >
            <Button type="primary" size="small">
              Подтвердить
            </Button>
          </Popconfirm>
          <Button
            size="small"
            onClick={() => {
              setComment("");
              setRejecting(r);
            }}
          >
            Отклонить
          </Button>
        </Space>
      ),
    });
  } else if (status !== "pending") {
    columns.push(
      { title: "Решено", dataIndex: "decided_at", render: (v) => fmtDateTime(v), width: 150 },
      { title: "Комментарий", dataIndex: "decision_comment", render: (v) => v || "—" },
    );
  }

  return (
    <div>
      <h2>Смена телефона</h2>
      <Typography.Paragraph type="secondary">
        Сотрудник входит в приложение только с одного телефона. Вход с другого ждёт решения:
        руководитель цеха подтверждает его в приложении («Мой цех»), HR — здесь.
      </Typography.Paragraph>
      <Tabs
        activeKey={status}
        onChange={(k) => setStatus(k as DeviceRequestStatus)}
        items={TABS.map((t) => ({ key: t.key, label: t.label }))}
      />
      <Table
        rowKey="request_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data}
        columns={columns}
        pagination={false}
      />
      <Modal
        title="Отклонить запрос"
        open={rejecting != null}
        onCancel={() => setRejecting(null)}
        okText="Отклонить"
        okButtonProps={{ danger: true }}
        cancelText="Отмена"
        confirmLoading={decide.isPending}
        onOk={() =>
          rejecting &&
          decide.mutate({ id: rejecting.request_id, decision: "reject", comment: comment.trim() || undefined })
        }
      >
        <Typography.Paragraph>
          {rejecting?.full_name}: вход с {rejecting ? deviceLabel(rejecting) : ""}
        </Typography.Paragraph>
        <Input.TextArea
          rows={3}
          maxLength={512}
          placeholder="Причина (сотрудник её не видит; останется в истории)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </Modal>
    </div>
  );
}
