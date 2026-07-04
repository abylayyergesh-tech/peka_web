import {
  AppstoreOutlined,
  BankOutlined,
  DashboardOutlined,
  FileTextOutlined,
  LockOutlined,
  LogoutOutlined,
  PieChartOutlined,
  PlusOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
  UserOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import type { MenuProps } from "antd";
import { App, Dropdown, Form, Layout, Menu, Modal, Select, Input } from "antd";
import { useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { changePassword, createOrganization, logoutApi } from "@/api/auth";
import { errorMessage } from "@/api/client";
import { useAuthStore } from "@/auth/store";
import { visibleSections } from "@/layout/menu";
import { useQueryClient } from "@tanstack/react-query";

const SECTION_ICONS: Record<string, React.ReactNode> = {
  catalog: <AppstoreOutlined />,
  inventory: <BankOutlined />,
  procurement: <ShoppingCartOutlined />,
  sales: <ShopOutlined />,
  finance: <WalletOutlined />,
  reports: <PieChartOutlined />,
  staff: <TeamOutlined />,
  my: <UserOutlined />,
  requests: <FileTextOutlined />,
  admin: <TeamOutlined />,
};

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { me, activeOrgId, caps, refreshToken, setActiveOrg, setTokens, logout } =
    useAuthStore();
  const [collapsed, setCollapsed] = useState(false);
  const [orgModalOpen, setOrgModalOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdForm] = Form.useForm();

  const menuItems: MenuProps["items"] = useMemo(() => {
    const sections = visibleSections(caps);
    return [
      { key: "/", icon: <DashboardOutlined />, label: "Дашборд" },
      ...sections.map((s) => ({
        key: s.key,
        icon: SECTION_ICONS[s.key],
        label: s.label,
        children: s.items.map((i) => ({ key: i.path, label: i.label })),
      })),
    ];
  }, [caps]);

  // Highlight the deepest nav path that prefixes the current URL, so detail
  // pages (/suppliers/5) still highlight their list item (/suppliers).
  const selectedKey = useMemo(() => {
    if (location.pathname === "/") return "/";
    const all = visibleSections(caps).flatMap((s) => s.items.map((i) => i.path));
    return all
      .filter((p) => location.pathname === p || location.pathname.startsWith(p + "/"))
      .sort((a, b) => b.length - a.length)[0] ?? location.pathname;
  }, [location.pathname, caps]);

  async function switchOrg(orgId: number) {
    setActiveOrg(orgId);
    // Every list/detail query is org-scoped; drop the whole cache on switch.
    queryClient.clear();
    navigate("/");
  }

  async function handleCreateOrg() {
    if (!newOrgName.trim()) return;
    setCreatingOrg(true);
    try {
      const org = await createOrganization(newOrgName.trim());
      message.success(`Организация «${org.name}» создана`);
      setOrgModalOpen(false);
      setNewOrgName("");
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      await switchOrg(org.id);
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setCreatingOrg(false);
    }
  }

  const userMenu: MenuProps["items"] = [
    { key: "email", label: me?.email, disabled: true },
    { type: "divider" },
    { key: "change-password", icon: <LockOutlined />, label: "Сменить пароль" },
    { key: "logout", icon: <LogoutOutlined />, label: "Выйти", danger: true },
  ];

  function handleLogout() {
    // Отзываем refresh-токен на сервере; локальную сессию чистим в любом случае.
    if (refreshToken) logoutApi(refreshToken).catch(() => undefined);
    logout();
    queryClient.clear();
    navigate("/login");
  }

  async function handleChangePassword(values: {
    current_password: string;
    new_password: string;
  }) {
    setPwdSaving(true);
    try {
      const out = await changePassword(values.current_password, values.new_password);
      // остальные сессии отозваны сервером; текущая живёт на новой паре
      setTokens(out.access_token, out.refresh_token);
      message.success("Пароль изменён; остальные сессии завершены");
      setPwdModalOpen(false);
      pwdForm.resetFields();
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setPwdSaving(false);
    }
  }

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Layout.Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} width={230}>
        <div
          style={{
            height: 48,
            margin: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 700,
            fontSize: collapsed ? 14 : 18,
            letterSpacing: 1,
          }}
        >
          {collapsed ? "RSM" : "Peka RSM"}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          items={menuItems}
          selectedKeys={[selectedKey]}
          onClick={({ key }) => {
            if (String(key).startsWith("/")) navigate(String(key));
          }}
        />
      </Layout.Sider>
      <Layout>
        <Layout.Header
          style={{
            background: "#fff",
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid #f0f0f0",
          }}
        >
          <Select
            style={{ minWidth: 220 }}
            value={activeOrgId ?? undefined}
            onChange={switchOrg}
            options={me?.organizations.map((o) => ({ value: o.id, label: o.name }))}
            placeholder="Организация"
            popupMatchSelectWidth={false}
            dropdownRender={(menu) => (
              <>
                {menu}
                <div
                  style={{ padding: 8, cursor: "pointer", color: "#1677ff" }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setOrgModalOpen(true)}
                >
                  <PlusOutlined /> Новая организация
                </div>
              </>
            )}
          />
          <Dropdown
            menu={{
              items: userMenu,
              onClick: ({ key }) => {
                if (key === "logout") handleLogout();
                if (key === "change-password") setPwdModalOpen(true);
              },
            }}
          >
            <span style={{ cursor: "pointer" }}>
              <UserOutlined style={{ marginRight: 8 }} />
              {me?.full_name}
            </span>
          </Dropdown>
        </Layout.Header>
        <Layout.Content style={{ padding: 24 }}>
          <Outlet />
        </Layout.Content>
      </Layout>
      <Modal
        title="Новая организация"
        open={orgModalOpen}
        onOk={handleCreateOrg}
        onCancel={() => setOrgModalOpen(false)}
        okText="Создать"
        cancelText="Отмена"
        confirmLoading={creatingOrg}
      >
        <Input
          placeholder="Название организации"
          value={newOrgName}
          onChange={(e) => setNewOrgName(e.target.value)}
          onPressEnter={handleCreateOrg}
        />
      </Modal>
      <Modal
        title="Сменить пароль"
        open={pwdModalOpen}
        onOk={() => pwdForm.submit()}
        onCancel={() => setPwdModalOpen(false)}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={pwdSaving}
        destroyOnClose
      >
        <Form form={pwdForm} layout="vertical" onFinish={handleChangePassword}>
          <Form.Item
            name="current_password"
            label="Текущий пароль"
            rules={[{ required: true, message: "Введите текущий пароль" }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            name="new_password"
            label="Новый пароль"
            rules={[
              { required: true, message: "Введите новый пароль" },
              { min: 8, message: "Минимум 8 символов" },
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="Повторите новый пароль"
            dependencies={["new_password"]}
            rules={[
              { required: true, message: "Повторите пароль" },
              ({ getFieldValue }) => ({
                validator: async (_, value) => {
                  if (value && value !== getFieldValue("new_password")) {
                    throw new Error("Пароли не совпадают");
                  }
                },
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
}
