/** Роли организации: список, создание/редактирование (имя + чекбоксы прав),
 * удаление не-встроенных ролей. Вся страница требует role.manage. */
import { PlusOutlined } from "@ant-design/icons";
import { App, Button, Checkbox, Descriptions, Form, Input, Popconfirm, Space, Table, Tag, Typography } from "antd";
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
import EntityCardDrawer from "@/components/EntityCardDrawer";
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
  const [open, setOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
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
    onSuccess: (row) => {
      message.success(editing ? "Роль сохранена" : "Роль создана");
      setEditing(row);
      setIsEditing(false);
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
    setIsEditing(true);
    setOpen(true);
  }

  function fillForm(row: RoleOut) {
    form.setFieldsValue({
      name: row.name,
      description: row.description ?? undefined,
      capabilities: row.capabilities,
    });
  }

  function openCard(row: RoleOut) {
    setEditing(row);
    fillForm(row);
    setIsEditing(false);
    setOpen(true);
  }

  function closeCard() {
    setOpen(false);
    setIsEditing(false);
    setEditing(null);
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
      width: 90,
      render: (_, row) =>
        canRole && !row.is_builtin ? (
          <Popconfirm
            title="Удалить роль?"
            okText="Удалить"
            cancelText="Отмена"
            onConfirm={() => remove.mutate(row.role_id)}
          >
            <a onClick={(e) => e.stopPropagation()}>Удалить</a>
          </Popconfirm>
        ) : null,
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
        rowClassName={() => "row-clickable"}
        onRow={(row) => ({ onClick: () => openCard(row) })}
      />
      <EntityCardDrawer
        open={open}
        onClose={closeCard}
        title={editing ? roleLabel(editing.name) : "Новая роль"}
        width={640}
        canEdit={canRole && editing != null}
        editing={isEditing}
        onStartEdit={() => {
          if (editing) fillForm(editing);
          setIsEditing(true);
        }}
        onCancelEdit={() => {
          if (editing) {
            fillForm(editing);
            setIsEditing(false);
          } else {
            closeCard();
          }
        }}
        onSave={() => form.submit()}
        savePending={save.isPending}
        extra={
          canRole && editing && !editing.is_builtin ? (
            <Popconfirm
              title="Удалить роль?"
              okText="Удалить"
              cancelText="Отмена"
              onConfirm={() => remove.mutate(editing.role_id)}
            >
              <Button danger>Удалить</Button>
            </Popconfirm>
          ) : undefined
        }
        view={
          editing ? (
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Название">
                <Space>
                  {roleLabel(editing.name)}
                  {editing.is_builtin && <Tag color="blue">встроенная</Tag>}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="Описание">
                {editing.description || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Права">
                {editing.capabilities.length
                  ? editing.capabilities
                      .map((key) => {
                        const cap = capsQuery.data?.find((c) => c.key === key);
                        return cap ? capLabel(cap) : key;
                      })
                      .join(", ")
                  : "—"}
              </Descriptions.Item>
            </Descriptions>
          ) : null
        }
        form={
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
        }
      />
    </div>
  );
}
