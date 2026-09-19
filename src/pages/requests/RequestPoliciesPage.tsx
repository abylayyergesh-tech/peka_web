/** /request-policies — пороги согласования M-из-N по типам заявлений
 * (cap request.policy.manage; GET тоже гейтится этим правом на бэкенде).
 * Порог снимается snapshot'ом при подаче — правка не влияет на заявления в полёте. */
import { App, Descriptions, Form, InputNumber, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  listRequestPolicies, updateRequestPolicy, type RequestPolicyOut,
} from "@/api/requests";
import { useCan } from "@/auth/store";
import EntityCardDrawer from "@/components/EntityCardDrawer";
import { REQUEST_TYPE_LABELS } from "@/pages/requests/shared";

export default function RequestPoliciesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("request.policy.manage");
  const [card, setCard] = useState<RequestPolicyOut | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form] = Form.useForm<{ required_approvals: number }>();

  const query = useQuery({
    queryKey: ["request-policies"],
    queryFn: listRequestPolicies,
  });

  const fresh =
    query.data?.find((r) => r.request_policy_id === card?.request_policy_id) ?? card;

  const save = useMutation({
    mutationFn: (values: { required_approvals: number }) =>
      updateRequestPolicy(fresh!.type, values),
    onSuccess: (row) => {
      message.success("Политика обновлена");
      setCard(row);
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["request-policies"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function fillForm(row: RequestPolicyOut) {
    form.setFieldsValue({ required_approvals: row.required_approvals });
  }

  function openCard(row: RequestPolicyOut) {
    setCard(row);
    fillForm(row);
    setEditing(false);
    setOpen(true);
  }

  function closeCard() {
    setOpen(false);
    setEditing(false);
    setCard(null);
  }

  const typeLabel = (t: RequestPolicyOut["type"]) => REQUEST_TYPE_LABELS[t] ?? t;

  const columns: ColumnsType<RequestPolicyOut> = [
    {
      title: "Тип заявления",
      dataIndex: "type",
      render: (t: RequestPolicyOut["type"]) => typeLabel(t),
    },
    { title: "Требуется одобрений", dataIndex: "required_approvals", width: 200 },
  ];

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Политики согласования</h2>
      <Typography.Paragraph type="secondary">
        Сколько одобрений (M-из-N) нужно заявлению каждого типа. Порог фиксируется
        в момент подачи: изменение политики не влияет на уже поданные заявления.
        Один отказ отклоняет заявление независимо от порога.
      </Typography.Paragraph>
      <Table
        rowKey="request_policy_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data}
        pagination={false}
        columns={columns}
        rowClassName={() => "row-clickable"}
        onRow={(row) => ({ onClick: () => openCard(row) })}
      />
      <EntityCardDrawer
        open={open}
        onClose={closeCard}
        title={fresh ? typeLabel(fresh.type) : "Порог согласования"}
        canEdit={canManage && fresh != null}
        editing={editing}
        onStartEdit={() => {
          if (fresh) fillForm(fresh);
          setEditing(true);
        }}
        onCancelEdit={() => {
          if (fresh) {
            fillForm(fresh);
            setEditing(false);
          } else {
            closeCard();
          }
        }}
        onSave={() => form.submit()}
        savePending={save.isPending}
        view={
          fresh ? (
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Тип заявления">
                {typeLabel(fresh.type)}
              </Descriptions.Item>
              <Descriptions.Item label="Требуется одобрений">
                {fresh.required_approvals}
              </Descriptions.Item>
            </Descriptions>
          ) : null
        }
        form={
          <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
            <Form.Item
              name="required_approvals"
              label="Требуется одобрений"
              rules={[{ required: true, message: "Укажите число одобрений" }]}
            >
              <InputNumber min={1} precision={0} style={{ width: "100%" }} />
            </Form.Item>
          </Form>
        }
      />
    </div>
  );
}
