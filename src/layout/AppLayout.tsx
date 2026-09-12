import {
  DashboardOutlined,
  InboxOutlined,
  LockOutlined,
  LogoutOutlined,
  PlusOutlined,
  ShopOutlined,
  TeamOutlined,
  UserOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import type { MenuProps } from "antd";
import { App, Button, Dropdown, Form, Layout, Menu, Modal, Result, Select, Input } from "antd";
import { useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { changePassword, createOrganization, logoutApi } from "@/api/auth";
import { errorMessage } from "@/api/client";
import { useAuthStore } from "@/auth/store";
import ErrorBoundary from "@/components/ErrorBoundary";
import { visibleSections } from "@/layout/menu";
import { BRAND } from "@/theme";
import { useQueryClient } from "@tanstack/react-query";

/** Адрес личного кабинета сотрудника — ссылка со стоп-экрана. */
const STAFF_URL = import.meta.env.VITE_STAFF_URL as string | undefined;

const SECTION_ICONS: Record<string, React.ReactNode> = {
  menu: <ShopOutlined />,
  inventory: <InboxOutlined />,
  finance: <WalletOutlined />,
  hr: <TeamOutlined />,
  admin: <LockOutlined />,
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

  // peka_web — рабочее место администрации. Участник без единого
  // административного права (обычный сотрудник цеха) не должен видеть здесь
  // пустой каркас: ему показывается, куда идти, — в личный кабинет.
  const sections = useMemo(() => visibleSections(caps), [caps]);
  const hasAnyModule = sections.length > 0;

  const menuItems: MenuProps["items"] = useMemo(() => {
    return [
      { key: "/", icon: <DashboardOutlined />, label: "Дашборд" },
      ...sections.map((s) => ({
        key: s.key,
        icon: SECTION_ICONS[s.key],
        label: s.label,
        children: s.items.map((i) => ({ key: i.path, label: i.label })),
      })),
    ];
  }, [sections]);

  // Highlight the deepest nav path that prefixes the current URL, so detail
  // pages (/suppliers/5) still highlight their list item (/suppliers). Items may
  // claim extra prefixes via `match` — the key stays the item's own path.
  const selectedKey = useMemo(() => {
    if (location.pathname === "/") return "/";
    const prefixes = visibleSections(caps).flatMap((s) =>
      s.items.flatMap((i) =>
        [i.path, ...(i.match ?? [])].map((prefix) => ({ prefix, key: i.path })),
      ),
    );
    const hit = prefixes
      .filter(
        ({ prefix }) =>
          location.pathname === prefix || location.pathname.startsWith(prefix + "/"),
      )
      .sort((a, b) => b.prefix.length - a.prefix.length)[0];
    return hit?.key ?? location.pathname;
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
      await switchOrg(org.organization_id);
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
      {/* Шире прежних 230: при базовом кегле 16 длинные пункты («Взаиморасчёты»,
          «Прайс-листы поставщиков») переносились на вторую строку. */}
      <Layout.Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={300}
        style={{ overflow: "auto", height: "100vh", position: "sticky", top: 0 }}
      >
        <div
          style={{
            height: 48,
            margin: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            color: "#fff",
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: 1,
          }}
        >
          {/* Логотип словесный и тёмно-зелёный, а сайдбар — того же зелёного,
              поэтому выводим его в белом: filter вместо второго файла. */}
          <img
            src="/logo.png"
            alt="Pekarelli"
            style={{
              height: collapsed ? 10 : 16,
              width: "auto",
              filter: "brightness(0) invert(1)",
            }}
          />
          {!collapsed && <span style={{ opacity: 0.7 }}>RSM</span>}
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
            borderBottom: `2px solid ${BRAND.cream}`,
          }}
        >
          <Select
            style={{ minWidth: 220 }}
            value={activeOrgId ?? undefined}
            onChange={switchOrg}
            options={me?.organizations.map((o) => ({ value: o.organization_id, label: o.name }))}
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
          {hasAnyModule ? (
            // Ключ по адресу: сломавшаяся страница не должна оставаться
            // сломанной после перехода в другой раздел — граница пересоздаётся.
            <ErrorBoundary key={location.pathname}>
              <Outlet />
            </ErrorBoundary>
          ) : (
            <Result
              status="info"
              title="Это рабочее место администрации"
              subTitle={
                <>
                  Ваша смена и заявления — в личном кабинете сотрудника.
                  {STAFF_URL && (
                    <>
                      {" "}
                      <a href={STAFF_URL}>Открыть кабинет</a>
                    </>
                  )}
                </>
              }
              extra={
                <Button onClick={handleLogout}>Выйти</Button>
              }
            />
          )}
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
