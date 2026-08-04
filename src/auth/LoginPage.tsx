import { LockOutlined, MailOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Form, Input, Typography } from "antd";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { login } from "@/api/auth";
import { errorMessage } from "@/api/client";
import { useAuthStore } from "@/auth/store";
import { BRAND } from "@/theme";

export default function LoginPage() {
  const navigate = useNavigate();
  const setTokens = useAuthStore((s) => s.setTokens);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onFinish(values: { email: string; password: string }) {
    setLoading(true);
    setError(null);
    try {
      const out = await login(values.email, values.password);
      setTokens(out.access_token, out.refresh_token);
      navigate("/", { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: BRAND.cream }}>
      <Card style={{ width: 380 }}>
        {/* Вход — витрина: знак бренда крупно, «RSM» подписью. */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <img src="/logo.png" alt="Pekarelli" style={{ height: 26, width: "auto" }} />
          <Typography.Text type="secondary" style={{ display: "block", marginTop: 6 }}>
            Система управления
          </Typography.Text>
        </div>
        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
        <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true, message: "Введите email" }, { type: "email", message: "Некорректный email" }]}
          >
            <Input prefix={<MailOutlined />} autoComplete="email" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Пароль"
            rules={[{ required: true, message: "Введите пароль" }]}
          >
            <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            Войти
          </Button>
        </Form>
        <div style={{ marginTop: 16, textAlign: "center" }}>
          Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
        </div>
        <div style={{ marginTop: 8, textAlign: "center" }}>
          <Link to="/forgot-password">Забыли пароль?</Link>
        </div>
      </Card>
    </div>
  );
}
