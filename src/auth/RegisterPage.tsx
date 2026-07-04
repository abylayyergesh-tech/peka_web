import { Alert, Button, Card, Form, Input, Typography } from "antd";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { register } from "@/api/auth";
import { errorMessage } from "@/api/client";
import { useAuthStore } from "@/auth/store";

export default function RegisterPage() {
  const navigate = useNavigate();
  const { setToken, setActiveOrg } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onFinish(values: {
    email: string;
    password: string;
    full_name: string;
    organization_name: string;
  }) {
    setLoading(true);
    setError(null);
    try {
      const out = await register(values);
      setToken(out.access_token);
      setActiveOrg(out.organization.id);
      navigate("/", { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f5" }}>
      <Card style={{ width: 420 }}>
        <Typography.Title level={3} style={{ textAlign: "center" }}>
          Регистрация
        </Typography.Title>
        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
        <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item name="organization_name" label="Название организации" rules={[{ required: true, message: "Введите название" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="full_name" label="Ваше имя" rules={[{ required: true, message: "Введите имя" }]}>
            <Input autoComplete="name" />
          </Form.Item>
          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true, message: "Введите email" }, { type: "email", message: "Некорректный email" }]}
          >
            <Input autoComplete="email" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Пароль"
            rules={[{ required: true, message: "Введите пароль" }, { min: 8, message: "Минимум 8 символов" }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            Создать организацию
          </Button>
        </Form>
        <div style={{ marginTop: 16, textAlign: "center" }}>
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </div>
      </Card>
    </div>
  );
}
