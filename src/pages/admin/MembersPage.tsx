/** Участники организации: список, добавление, смена роли, удаление,
 * drawer индивидуальных прав (при наличии role.manage). */
import { PlusOutlined } from "@ant-design/icons";
import { App, Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addMember,
  assignRole,
  BUILTIN_ROLE_NAMES,
  listMembers,
  listRoles,
  removeMember,
  TENANCY_ROLE_NAMES,
  updateMemberRole,
  type MemberOut,
} from "@/api/admin";
import { errorMessage } from "@/api/client";
import { useAuthStore, useCan } from "@/auth/store";
import MemberCapabilitiesDrawer from "@/pages/admin/MemberCapabilitiesDrawer";
import { roleLabel } from "@/pages/admin/labels";

export default function MembersPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canMember = useCan("member.manage");
  const canRole = useCan("role.manage");
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const orgId = activeOrgId ?? 0;

  const [addOpen, setAddOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<MemberOut | null>(null);
  const [drawerMember, setDrawerMember] = useState<MemberOut | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addForm] = Form.useForm();
  const [roleForm] = Form.useForm();

  const membersQuery = useQuery({
    queryKey: ["members", orgId],
    queryFn: () => listMembers(orgId),
    enabled: activeOrgId != null,
  });

  // GET /roles требует role.manage (иначе 403) — без него не запрашиваем
  // и используем список встроенных ролей.
  const rolesQuery = useQuery({
    queryKey: ["roles"],
    queryFn: listRoles,
    staleTime: 60_000,
    enabled: canRole,
  });
  const roles = rolesQuery.data;

  function invalidateMembers() {
    queryClient.invalidateQueries({ queryKey: ["members"] });
    queryClient.invalidateQueries({ queryKey: ["member-capabilities"] });
  }

  const add = useMutation({
    mutationFn: async (v: { email: string; role: string }) => {
      if ((TENANCY_ROLE_NAMES as readonly string[]).includes(v.role)) {
        return addMember(orgId, v);
      }
      // tenancy-API принимает только owner/manager/employee. Для hr-admin и
      // кастомных ролей: добавляем как employee, затем назначаем нужную роль
      // по role_id через RBAC (доступно только с role.manage).
      const target = roles?.find((r) => r.name === v.role);
      if (!target) return addMember(orgId, v); // бэкенд ответит 422 — покажем ошибку
      const created = await addMember(orgId, { email: v.email, role: "employee" });
      await assignRole(created.id, target.id);
      return created;
    },
    onSuccess: () => {
      message.success("Участник добавлен");
      setAddOpen(false);
      invalidateMembers();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const changeRole = useMutation({
    mutationFn: async (v: { role: number | string }) => {
      if (typeof v.role === "number") {
        await assignRole((roleTarget as MemberOut).id, v.role);
      } else {
        await updateMemberRole(orgId, (roleTarget as MemberOut).id, v.role);
      }
    },
    onSuccess: () => {
      message.success("Роль изменена");
      setRoleTarget(null);
      invalidateMembers();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (membershipId: number) => removeMember(orgId, membershipId),
    onSuccess: () => {
      message.success("Участник удалён");
      invalidateMembers();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openAdd() {
    addForm.resetFields();
    setAddOpen(true);
  }

  function openChangeRole(row: MemberOut) {
    setRoleTarget(row);
    roleForm.setFieldsValue({
      role: roles ? roles.find((r) => r.name === row.role)?.id : row.role,
    });
  }

  function openDrawer(row: MemberOut) {
    setDrawerMember(row);
    setDrawerOpen(true);
  }

  // Варианты роли: имена (для tenancy POST); с role.manage — все роли организации.
  const roleNameOptions = (roles?.map((r) => r.name) ?? [...BUILTIN_ROLE_NAMES]).map(
    (name) => ({ value: name, label: roleLabel(name) }),
  );
  // Смена роли: с role.manage — по role_id (RBAC, любые роли);
  // иначе — по имени встроенной роли (tenancy PATCH).
  const changeRoleOptions: { value: number | string; label: string }[] = roles
    ? roles.map((r) => ({ value: r.id, label: roleLabel(r.name) }))
    : TENANCY_ROLE_NAMES.map((name) => ({ value: name, label: roleLabel(name) }));

  const columns: ColumnsType<MemberOut> = [
    { title: "Имя", dataIndex: "full_name", render: (v: string | null) => v || "—" },
    { title: "Email", dataIndex: "email", render: (v: string | null) => v || "—" },
    {
      title: "Роль",
      dataIndex: "role",
      width: 180,
      render: (v: string) => <Tag>{roleLabel(v)}</Tag>,
    },
    {
      title: "",
      width: 260,
      render: (_, row) => (
        <Space size="middle">
          {canMember && <a onClick={() => openChangeRole(row)}>Сменить роль</a>}
          {canRole && <a onClick={() => openDrawer(row)}>Права</a>}
          {canMember && (
            <Popconfirm
              title="Удалить участника?"
              okText="Удалить"
              cancelText="Отмена"
              onConfirm={() => remove.mutate(row.id)}
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
        <h2 style={{ margin: 0 }}>Участники</h2>
        {canMember && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
            Добавить участника
          </Button>
        )}
      </Space>
      <Table
        rowKey="id"
        size="small"
        loading={membersQuery.isPending}
        dataSource={membersQuery.data}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        columns={columns}
      />

      <Modal
        title="Добавить участника"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={() => addForm.submit()}
        okText="Добавить"
        cancelText="Отмена"
        confirmLoading={add.isPending}
        destroyOnClose
      >
        <Form form={addForm} layout="vertical" onFinish={(v) => add.mutate(v)}>
          <Form.Item
            name="email"
            label="Email существующего пользователя"
            rules={[
              { required: true, message: "Обязательное поле" },
              { type: "email", message: "Некорректный email" },
            ]}
          >
            <Input placeholder="user@example.com" />
          </Form.Item>
          <Form.Item
            name="role"
            label="Роль"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Select
              options={roleNameOptions}
              showSearch
              optionFilterProp="label"
              placeholder="Выберите роль"
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Сменить роль"
        open={roleTarget != null}
        onCancel={() => setRoleTarget(null)}
        onOk={() => roleForm.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={changeRole.isPending}
        destroyOnClose
      >
        <Form form={roleForm} layout="vertical" onFinish={(v) => changeRole.mutate(v)}>
          <Form.Item
            name="role"
            label={`Роль участника ${roleTarget?.full_name || roleTarget?.email || ""}`}
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Select
              options={changeRoleOptions}
              showSearch
              optionFilterProp="label"
              placeholder="Выберите роль"
            />
          </Form.Item>
        </Form>
      </Modal>

      <MemberCapabilitiesDrawer
        member={drawerMember}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
