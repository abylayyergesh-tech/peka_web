/** Роли организации: список, создание/редактирование (имя + чекбоксы прав),
 * удаление не-встроенных ролей. Вся страница требует role.manage. */
import { PlusOutlined } from "@ant-design/icons";
import { App, Button, Checkbox, Form, Input, Modal, Popconfirm, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createRole,
  deleteRole,
  listCapabilities,
  listRoles,
  updateRole,
  type RoleOut,
} from "@/api/admin";
import { errorMessage } from "@/api/client";
import { useCan } from "@/auth/store";
import { capLabel, groupByPrefix, groupTitle, roleLabel } from "@/pages/admin/labels";

interface RoleFormValues {
  name: string;
  description?: string;
  capabilities?: string[];
}

export default function RolesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canRole = useCan("role.manage");
  const [editing, setEditing] = useState<RoleOut | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const rolesQuery = useQuery({ queryKey: ["roles"], queryFn: listRoles });
  const capsQuery = useQuery({
    queryKey: ["capabilities"],
    queryFn: listCapabilities,
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: (v: RoleFormValues) => {
      const body = {
        name: v.name,
        description: v.description || undefined,
        capabilities: v.capabilities ?? [],
      };
      return editing ? updateRole(editing.role_id, body) : createRole(body);
    },
    onSuccess: () => {
      message.success(editing ? "Роль сохранена" : "Роль создана");
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      queryClient.invalidateQueries({ queryKey: ["member-capabilities"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (roleId: number) => deleteRole(roleId),
    onSuccess: () => {
      message.success("Роль удалена");
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
    // 409: встроенная роль или роль назначена участникам — покажем сообщение бэкенда
    onError: (e) => message.error(errorMessage(e)),
  });

  function openCreate() {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  }

  function openEdit(row: RoleOut) {
    setEditing(row);
    form.setFieldsValue({
      name: row.name,
      description: row.description ?? undefined,
      capabilities: row.capabilities,
    });
    setModalOpen(true);
  }

  // Встроенная роль owner обязана сохранять полный набор прав — чекбоксы блокируем.
  const isOwnerRole = editing != null && editing.is_builtin && editing.name === "owner";

  const columns: ColumnsType<RoleOut> = [
    {
      title: "Название",
      dataIndex: "name",
      render: (v: string, row) => (
        <Space>
          {roleLabel(v)}
          {row.is_builtin && <Tag color="blue">встроенная</Tag>}
        </Space>
      ),
    },
    { title: "Описание", dataIndex: "description", render: (v: string | null) => v || "—" },
    {
      title: "Прав",
      dataIndex: "capabilities",
      width: 90,
      render: (v: string[]) => v.length,
    },
    {
      title: "",
      width: 180,
      render: (_, row) =>
        canRole && (
          <Space size="middle">
            <a onClick={() => openEdit(row)}>Изменить</a>
            {!row.is_builtin && (
              <Popconfirm
                title="Удалить роль?"
                okText="Удалить"
                cancelText="Отмена"
                onConfirm={() => remove.mutate(row.role_id)}
              >
                <a>Удалить</a>
              </Popconfirm>
            )}
          </Space>
        ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <h2 style={{ margin: 0 }}>Роли</h2>
        {canRole && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Добавить роль
          </Button>
        )}
      </Space>
      <Table
        rowKey="role_id"
        size="small"
        loading={rolesQuery.isPending}
        dataSource={rolesQuery.data}
        pagination={false}
        columns={columns}
      />
      <Modal
        title={editing ? "Изменить роль" : "Новая роль"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={save.isPending}
        destroyOnClose
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Form.Item
            name="name"
            label="Название"
            rules={[
              { required: true, message: "Обязательное поле" },
              { max: 64, message: "Не более 64 символов" },
            ]}
          >
            <Input disabled={editing?.is_protected} />
          </Form.Item>
          <Form.Item name="description" label="Описание" rules={[{ max: 255, message: "Не более 255 символов" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="capabilities" label="Права">
            <Checkbox.Group style={{ width: "100%" }} disabled={isOwnerRole}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
                {groupByPrefix(capsQuery.data ?? []).map(([prefix, caps]) => (
                  <div key={prefix} style={{ marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{groupTitle(prefix)}</div>
                    {caps.map((cap) => (
                      <div key={cap.key}>
                        <Checkbox value={cap.key}>{capLabel(cap)}</Checkbox>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </Checkbox.Group>
          </Form.Item>
          {isOwnerRole && (
            <Typography.Text type="secondary">
              Роль «Владелец» всегда сохраняет полный набор прав.
            </Typography.Text>
          )}
        </Form>
      </Modal>
    </div>
  );
}
