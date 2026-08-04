/** Участники организации: список, приглашения по email, добавление, смена роли,
 * выдача пароля, удаление, drawer индивидуальных прав (при наличии role.manage).
 *
 * Пароль выдаётся здесь, а не письмом: у сотрудников цеха технические адреса в
 * нероутируемом домене, и приглашение до них не доходит. Сгенерированный пароль
 * показывается один раз — дальше в базе только хэш. */
import { MailOutlined, PlusOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Descriptions,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
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
  setMemberPassword,
  type MemberPasswordOut,
  TENANCY_ROLE_NAMES,
  updateMemberRole,
  type MemberOut,
} from "@/api/admin";
import { errorMessage } from "@/api/client";
import {
  createInvite,
  listInvites,
  revokeInvite,
  type InviteOut,
} from "@/api/invites";
import { useAuthStore, useCan } from "@/auth/store";
import { fmtDateTime } from "@/components/format";
import MemberCapabilitiesDrawer from "@/pages/admin/MemberCapabilitiesDrawer";
import { roleLabel } from "@/pages/admin/labels";

const INVITE_STATUS: Record<string, { color: string; label: string }> = {
  pending: { color: "processing", label: "Ожидает" },
  accepted: { color: "success", label: "Принято" },
  revoked: { color: "default", label: "Отозвано" },
};

export default function MembersPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const canMember = useCan("member.manage");
  const canRole = useCan("role.manage");
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const orgId = activeOrgId ?? 0;

  const [addOpen, setAddOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<MemberOut | null>(null);
  const [drawerMember, setDrawerMember] = useState<MemberOut | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  /** Выданный пароль: показывается один раз, поэтому живёт в модалке. */
  const [issued, setIssued] = useState<MemberPasswordOut | null>(null);
  const [addForm] = Form.useForm();
  const [inviteForm] = Form.useForm();
  const [roleForm] = Form.useForm();

  const membersQuery = useQuery({
    queryKey: ["members", orgId],
    queryFn: () => listMembers(orgId),
    enabled: activeOrgId != null,
  });

  const invitesQuery = useQuery({
    queryKey: ["invites", orgId],
    queryFn: () => listInvites(orgId),
    enabled: activeOrgId != null && canMember,
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
      await assignRole(created.membership_id, target.role_id);
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
        await assignRole((roleTarget as MemberOut).membership_id, v.role);
      } else {
        await updateMemberRole(orgId, (roleTarget as MemberOut).membership_id, v.role);
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

  const invite = useMutation({
    mutationFn: (v: { email: string; role: string }) => createInvite(orgId, v),
    onSuccess: (out) => {
      setInviteOpen(false);
      queryClient.invalidateQueries({ queryKey: ["invites"] });
      modal.success({
        title: out.email_sent
          ? "Приглашение отправлено"
          : "Приглашение создано (письмо не отправлено)",
        content: (
          <>
            <p>
              {out.email_sent
                ? `Письмо со ссылкой ушло на ${out.email}. На всякий случай ссылку можно скопировать и передать вручную:`
                : `Не удалось отправить письмо на ${out.email} — передайте ссылку вручную:`}
            </p>
            <Typography.Paragraph copyable={{ text: out.invite_link }} style={{ wordBreak: "break-all" }}>
              {out.invite_link}
            </Typography.Paragraph>
          </>
        ),
        okText: "Готово",
        width: 520,
      });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const revoke = useMutation({
    mutationFn: (inviteId: number) => revokeInvite(orgId, inviteId),
    onSuccess: () => {
      message.success("Приглашение отозвано");
      queryClient.invalidateQueries({ queryKey: ["invites"] });
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
      role: roles ? roles.find((r) => r.name === row.role)?.role_id : row.role,
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
    ? roles.map((r) => ({ value: r.role_id, label: roleLabel(r.name) }))
    : TENANCY_ROLE_NAMES.map((name) => ({ value: name, label: roleLabel(name) }));

  const passwordReset = useMutation({
    mutationFn: (row: MemberOut) => setMemberPassword(orgId, row.membership_id),
    onSuccess: (out) => {
      // Пароль виден ОДИН раз: в базе только хэш. Поэтому не toast, а модалка,
      // которую можно спокойно скопировать и передать человеку.
      setIssued(out);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

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
      width: 330,
      render: (_, row) => (
        <Space size="middle">
          {canMember && <a onClick={() => openChangeRole(row)}>Сменить роль</a>}
          {canMember && (
            <Popconfirm
              title="Выдать новый пароль?"
              description="Старый перестанет работать, все сессии участника закроются."
              okText="Выдать"
              cancelText="Отмена"
              onConfirm={() => passwordReset.mutate(row)}
            >
              <a>Пароль</a>
            </Popconfirm>
          )}
          {canRole && <a onClick={() => openDrawer(row)}>Права</a>}
          {canMember && (
            <Popconfirm
              title="Удалить участника?"
              okText="Удалить"
              cancelText="Отмена"
              onConfirm={() => remove.mutate(row.membership_id)}
            >
              <a>Удалить</a>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const inviteColumns: ColumnsType<InviteOut> = [
    { title: "Email", dataIndex: "email" },
    {
      title: "Роль",
      dataIndex: "role",
      width: 160,
      render: (v: string) => <Tag>{roleLabel(v)}</Tag>,
    },
    {
      title: "Статус",
      dataIndex: "status",
      width: 130,
      render: (v: string) => {
        const s = INVITE_STATUS[v] ?? { color: "default", label: v };
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    {
      title: "Действует до",
      dataIndex: "expires_at",
      width: 170,
      render: (v: string) => fmtDateTime(v),
    },
    {
      title: "",
      width: 100,
      render: (_, row) =>
        row.status === "pending" && (
          <Popconfirm
            title="Отозвать приглашение?"
            okText="Отозвать"
            cancelText="Отмена"
            onConfirm={() => revoke.mutate(row.invite_id)}
          >
            <a>Отозвать</a>
          </Popconfirm>
        ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <h2 style={{ margin: 0 }}>Участники</h2>
        {canMember && (
          <Space>
            <Button
              type="primary"
              icon={<MailOutlined />}
              onClick={() => {
                inviteForm.resetFields();
                setInviteOpen(true);
              }}
            >
              Пригласить по email
            </Button>
            <Button icon={<PlusOutlined />} onClick={openAdd}>
              Добавить участника
            </Button>
          </Space>
        )}
      </Space>
      <Table
        rowKey="membership_id"
        size="small"
        loading={membersQuery.isPending}
        dataSource={membersQuery.data}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        columns={columns}
      />

      {canMember && (
        <>
          <h3 style={{ margin: "24px 0 12px" }}>Приглашения</h3>
          <Table
            rowKey="invite_id"
            size="small"
            loading={invitesQuery.isPending}
            dataSource={invitesQuery.data}
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            columns={inviteColumns}
            locale={{ emptyText: "Приглашений пока нет" }}
          />
        </>
      )}

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
        title="Пригласить по email"
        open={inviteOpen}
        onCancel={() => setInviteOpen(false)}
        onOk={() => inviteForm.submit()}
        okText="Отправить приглашение"
        cancelText="Отмена"
        confirmLoading={invite.isPending}
        destroyOnClose
      >
        <Form form={inviteForm} layout="vertical" onFinish={(v) => invite.mutate(v)}>
          <Form.Item
            name="email"
            label="Email приглашаемого"
            extra="Регистрация не требуется: человек создаст аккаунт по ссылке из письма и сразу попадёт в организацию."
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
            initialValue="employee"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Select
              options={TENANCY_ROLE_NAMES.map((name) => ({
                value: name,
                label: roleLabel(name),
              }))}
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

      <Modal
        open={issued != null}
        onCancel={() => setIssued(null)}
        title="Пароль выдан"
        okText="Готово"
        onOk={() => setIssued(null)}
        cancelButtonProps={{ style: { display: "none" } }}
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Запишите пароль сейчас"
          description="Второй раз его не показать: в базе хранится только хэш. Все прежние сессии участника закрыты."
        />
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="Сотрудник">
            {issued?.full_name || "—"}
          </Descriptions.Item>
          <Descriptions.Item label="Логин">
            <Typography.Text copyable code>{issued?.email}</Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="Пароль">
            <Typography.Text copyable code strong>
              {issued?.password}
            </Typography.Text>
          </Descriptions.Item>
        </Descriptions>
      </Modal>

      <MemberCapabilitiesDrawer
        member={drawerMember}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
