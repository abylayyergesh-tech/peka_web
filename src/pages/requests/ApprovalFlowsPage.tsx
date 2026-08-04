/** Маршруты согласования: на каждый тип заявления — упорядоченный список стадий.
 *
 * Стадия адресуется ЛИБО конкретному пользователю, ЛИБО роли (тогда подписать
 * может любой участник с этой ролью). Последняя стадия — подтверждение HR:
 * после неё применяется эффект заявления и регистрируется перевод средств.
 *
 * Правка маршрута не затрагивает уже поданные заявления — у них снимок стадий
 * на момент подачи. */
import { DeleteOutlined, DownOutlined, PlusOutlined, UpOutlined } from "@ant-design/icons";
import {
  App,
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import { listMembers, listRoles } from "@/api/admin";
import {
  listApprovalFlows,
  replaceApprovalFlow,
  type ApprovalFlowOut,
  type ApprovalFlowStepIn,
  type RequestType,
} from "@/api/requests";
import { useAuthStore, useCan } from "@/auth/store";
import { REQUEST_TYPE_LABELS } from "@/pages/requests/shared";

/** Черновик стадии в редакторе (до отправки на бэкенд). */
interface DraftStep {
  key: string;
  title: string;
  /** Кому адресована: конкретный пользователь или роль. */
  target: { kind: "user"; userId: number } | { kind: "role"; role: string };
}

let draftSeq = 0;
const nextKey = () => `s${(draftSeq += 1)}`;

export default function ApprovalFlowsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("request.policy.manage");
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const [editing, setEditing] = useState<ApprovalFlowOut | null>(null);
  const [steps, setSteps] = useState<DraftStep[]>([]);
  const [addForm] = Form.useForm<{ title?: string; target: string }>();

  const flows = useQuery({ queryKey: ["approval-flows"], queryFn: listApprovalFlows });

  const members = useQuery({
    queryKey: ["members-options", activeOrgId],
    queryFn: () => listMembers(activeOrgId!),
    staleTime: 60_000,
    enabled: activeOrgId != null,
  });

  const roles = useQuery({
    queryKey: ["roles-options"],
    queryFn: listRoles,
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: () => {
      const payload: ApprovalFlowStepIn[] = steps.map((s, i) => ({
        step_no: i + 1,
        title: s.title || null,
        approver_user_id: s.target.kind === "user" ? s.target.userId : null,
        approver_role: s.target.kind === "role" ? s.target.role : null,
        // Финальная — всегда последняя: именно она подтверждает и запускает перевод.
        is_final: i === steps.length - 1,
      }));
      return replaceApprovalFlow(editing!.request_type, payload);
    },
    onSuccess: () => {
      message.success("Маршрут сохранён");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["approval-flows"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openEdit(flow: ApprovalFlowOut) {
    setEditing(flow);
    setSteps(
      flow.steps.map((s) => ({
        key: nextKey(),
        title: s.title ?? "",
        target:
          s.approver_user_id != null
            ? { kind: "user", userId: s.approver_user_id }
            : { kind: "role", role: s.approver_role ?? "owner" },
      })),
    );
  }

  function targetLabel(target: DraftStep["target"]): string {
    if (target.kind === "role") return `Роль: ${target.role}`;
    const member = members.data?.find((m) => m.user_id === target.userId);
    return member?.email ?? member?.full_name ?? `Пользователь #${target.userId}`;
  }

  function addStep(values: { title?: string; target: string }) {
    const [kind, value] = values.target.split(":");
    setSteps((prev) => [
      ...prev,
      {
        key: nextKey(),
        title: values.title ?? "",
        target:
          kind === "user"
            ? { kind: "user", userId: Number(value) }
            : { kind: "role", role: value },
      },
    ]);
    addForm.resetFields();
  }

  function move(index: number, delta: number) {
    setSteps((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  const flowColumns: ColumnsType<ApprovalFlowOut> = [
    {
      title: "Тип заявления",
      dataIndex: "request_type",
      width: 220,
      render: (v: RequestType) => REQUEST_TYPE_LABELS[v] ?? v,
    },
    {
      title: "Стадии согласования",
      key: "steps",
      render: (_, row) => (
        <Space wrap size={[4, 4]}>
          {row.steps.length === 0 && <Typography.Text type="danger">Маршрут пуст</Typography.Text>}
          {row.steps.map((s) => (
            <Tag key={s.approval_flow_step_id} color={s.is_final ? "green" : "blue"}>
              {s.step_no}.{" "}
              {s.approver_user_id != null
                ? s.approver_email ?? `Пользователь #${s.approver_user_id}`
                : `Роль: ${s.approver_role}`}
              {s.is_final ? " · подтверждение HR" : ""}
            </Tag>
          ))}
        </Space>
      ),
    },
    ...(canManage
      ? ([
          {
            title: "",
            key: "actions",
            width: 110,
            render: (_: unknown, row: ApprovalFlowOut) => (
              <a onClick={() => openEdit(row)}>Настроить</a>
            ),
          },
        ] as ColumnsType<ApprovalFlowOut>)
      : []),
  ];

  const stepColumns: ColumnsType<DraftStep> = [
    {
      title: "№",
      key: "no",
      width: 50,
      render: (_, __, index) => index + 1,
    },
    {
      title: "Согласующий",
      key: "target",
      render: (_, row) => targetLabel(row.target),
    },
    {
      title: "Название стадии",
      key: "title",
      render: (_, row, index) => (
        <Input
          size="small"
          value={row.title}
          placeholder="например «Согласование руководителя»"
          onChange={(e) =>
            setSteps((prev) =>
              prev.map((s, i) => (i === index ? { ...s, title: e.target.value } : s)),
            )
          }
        />
      ),
    },
    {
      title: "Роль стадии",
      key: "final",
      width: 190,
      render: (_, __, index) =>
        index === steps.length - 1 ? (
          <Tag color="green">Подтверждение HR · перевод</Tag>
        ) : (
          <Tag color="blue">Согласование</Tag>
        ),
    },
    {
      title: "",
      key: "actions",
      width: 110,
      render: (_, __, index) => (
        <Space size={4}>
          <Button
            size="small"
            icon={<UpOutlined />}
            disabled={index === 0}
            onClick={() => move(index, -1)}
          />
          <Button
            size="small"
            icon={<DownOutlined />}
            disabled={index === steps.length - 1}
            onClick={() => move(index, 1)}
          />
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => setSteps((prev) => prev.filter((_, i) => i !== index))}
          />
        </Space>
      ),
    },
  ];

  const targetOptions = [
    {
      label: "Роли",
      options: (roles.data ?? []).map((r) => ({
        value: `role:${r.name}`,
        label: `Роль: ${r.name}`,
      })),
    },
    {
      label: "Пользователи",
      options: (members.data ?? []).map((m) => ({
        value: `user:${m.user_id}`,
        label: m.email ?? m.full_name ?? `Пользователь #${m.user_id}`,
      })),
    },
  ];

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Маршруты согласования</h2>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Как это работает"
        description={
          <>
            Стадии проходятся строго по порядку. Стадия, адресованная роли, может быть
            подписана любым участником с этой ролью; адресованная пользователю — только
            им. Одно отклонение завершает заявление. Последняя стадия — подтверждение
            HR: после неё применяется эффект заявления (увольнение, отпуск, займ, приём
            в штат, правка табеля) и регистрируется перевод средств. Изменение маршрута
            не затрагивает уже поданные заявления.
          </>
        }
      />

      <Table
        rowKey="approval_flow_id"
        size="small"
        loading={flows.isLoading}
        dataSource={flows.data ?? []}
        columns={flowColumns}
        pagination={false}
      />

      <Modal
        open={editing != null}
        title={`Маршрут — ${editing ? REQUEST_TYPE_LABELS[editing.request_type] : ""}`}
        okText="Сохранить маршрут"
        cancelText="Отмена"
        width={860}
        confirmLoading={save.isPending}
        onCancel={() => setEditing(null)}
        onOk={() => {
          if (steps.length === 0) {
            message.error("Нужна минимум одна стадия");
            return;
          }
          save.mutate();
        }}
        destroyOnClose
      >
        <Table
          rowKey="key"
          size="small"
          dataSource={steps}
          columns={stepColumns}
          pagination={false}
          locale={{ emptyText: "Стадий нет — добавьте хотя бы одну" }}
          style={{ marginBottom: 16 }}
        />

        <Card size="small" title="Добавить стадию">
          <Form form={addForm} layout="inline" onFinish={addStep}>
            <Form.Item name="target" label="Согласующий" rules={[{ required: true }]}>
              <Select
                style={{ width: 260 }}
                showSearch
                optionFilterProp="label"
                options={targetOptions}
                placeholder="Роль или пользователь"
              />
            </Form.Item>
            <Form.Item name="title" label="Название">
              <Input style={{ width: 220 }} placeholder="необязательно" />
            </Form.Item>
            <Form.Item>
              <Button icon={<PlusOutlined />} htmlType="submit">
                Добавить
              </Button>
            </Form.Item>
          </Form>
        </Card>

        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          Последняя стадия автоматически становится подтверждением HR — переставьте
          стадии стрелками, если нужен другой порядок.
        </Typography.Paragraph>
      </Modal>
    </div>
  );
}
