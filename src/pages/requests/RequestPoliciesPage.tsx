/** /request-policies — пороги согласования M-из-N по типам заявлений
 * (cap request.policy.manage; GET тоже гейтится этим правом на бэкенде).
 * Порог снимается snapshot'ом при подаче — правка не влияет на заявления в полёте. */
import { App, Form, InputNumber, Modal, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  listRequestPolicies, updateRequestPolicy, type RequestPolicyOut,
} from "@/api/requests";
import { useCan } from "@/auth/store";
import { REQUEST_TYPE_LABELS } from "@/pages/requests/shared";

export default function RequestPoliciesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("request.policy.manage");
  const [editing, setEditing] = useState<RequestPolicyOut | null>(null);
  const [form] = Form.useForm<{ required_approvals: number }>();

  const query = useQuery({
    queryKey: ["request-policies"],
    queryFn: listRequestPolicies,
  });

  const save = useMutation({
    mutationFn: (values: { required_approvals: number }) =>
      updateRequestPolicy(editing!.type, values),
    onSuccess: () => {
      message.success("Политика обновлена");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["request-policies"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openEdit(row: RequestPolicyOut) {
    form.setFieldsValue({ required_approvals: row.required_approvals });
    setEditing(row);
  }

  const columns: ColumnsType<RequestPolicyOut> = [
    {
      title: "Тип заявления",
      dataIndex: "type",
      render: (t: RequestPolicyOut["type"]) => REQUEST_TYPE_LABELS[t] ?? t,
    },
    { title: "Требуется одобрений", dataIndex: "required_approvals", width: 200 },
    {
      title: "",
      key: "actions",
      width: 100,
      render: (_, row) => canManage && <a onClick={() => openEdit(row)}>Изменить</a>,
    },
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
        rowKey="id"
        size="small"
        loading={query.isPending}
        dataSource={query.data}
        pagination={false}
        columns={columns}
      />
      <Modal
        title={
          editing
            ? `Порог согласования: ${REQUEST_TYPE_LABELS[editing.type] ?? editing.type}`
            : "Порог согласования"
        }
        open={editing != null}
        onCancel={() => setEditing(null)}
        onOk={() => form.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={save.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Form.Item
            name="required_approvals"
            label="Требуется одобрений"
            rules={[{ required: true, message: "Укажите число одобрений" }]}
          >
            <InputNumber min={1} precision={0} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
