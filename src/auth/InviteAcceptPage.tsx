/** Принятие приглашения в организацию по ссылке из письма.
 *  Новый пользователь задаёт имя и пароль; существующий просто подтверждает —
 *  владение ссылкой (доступ к почте) и есть аутентификация. */
import { LockOutlined, TeamOutlined, UserOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Descriptions, Form, Input, Spin, Typography } from "antd";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import { acceptInvite, getInvitePublic } from "@/api/invites";
import { useAuthStore } from "@/auth/store";
import { roleLabel } from "@/pages/admin/labels";

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { setTokens, setActiveOrg } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  const invite = useQuery({
    queryKey: ["invite", token],
    queryFn: () => getInvitePublic(token as string),
    enabled: !!token,
    retry: false,
  });

  async function accept(values?: { full_name?: string; password?: string }) {
    if (!token) return;
    setAccepting(true);
    setError(null);
    try {
      const out = await acceptInvite(token, values ?? {});
      setTokens(out.access_token, out.refresh_token);
      setActiveOrg(out.organization_id);
      navigate("/", { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f5" }}>
      <Card style={{ width: 440 }}>
        <Typography.Title level={3} style={{ textAlign: "center" }}>
          <TeamOutlined /> Приглашение
        </Typography.Title>

        {invite.isPending && (
          <div style={{ textAlign: "center", padding: 24 }}>
            <Spin />
          </div>
        )}

        {invite.isError && (
          <>
            <Alert
              type="error"
              showIcon
              message="Ссылка недействительна"
              description="Приглашение не найдено, устарело или уже использовано. Попросите администратора отправить новое."
            />
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <Link to="/login">Ко входу</Link>
            </div>
          </>
        )}

        {invite.data && (
          <>
            <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Организация">
                {invite.data.organization_name}
              </Descriptions.Item>
              <Descriptions.Item label="Email">{invite.data.email}</Descriptions.Item>
              <Descriptions.Item label="Роль">
                {roleLabel(invite.data.role)}
              </Descriptions.Item>
            </Descriptions>
            {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}

            {invite.data.user_exists ? (
              <>
                <Typography.Paragraph type="secondary">
                  Аккаунт с этим email уже существует — после принятия организация
                  появится в вашем списке.
                </Typography.Paragraph>
                <Button type="primary" block loading={accepting} onClick={() => accept()}>
                  Принять приглашение
                </Button>
              </>
            ) : (
              <Form layout="vertical" onFinish={accept} requiredMark={false}>
                <Form.Item
                  name="full_name"
                  label="Ваше имя"
                  rules={[{ required: true, message: "Введите имя" }]}
                >
                  <Input prefix={<UserOutlined />} autoComplete="name" />
                </Form.Item>
                <Form.Item
                  name="password"
                  label="Придумайте пароль"
                  rules={[
                    { required: true, message: "Введите пароль" },
                    { min: 8, message: "Минимум 8 символов" },
                  ]}
                >
                  <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
                </Form.Item>
                <Button type="primary" htmlType="submit" block loading={accepting}>
                  Создать аккаунт и присоединиться
                </Button>
              </Form>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
