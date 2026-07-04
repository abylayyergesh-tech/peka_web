/** Запрос ссылки на сброс пароля. Бэкенд всегда отвечает 204 — существование
 *  email не раскрывается, поэтому после отправки показываем один и тот же текст. */
import { MailOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Form, Input, Typography } from "antd";
import { useState } from "react";
import { Link } from "react-router-dom";

import { forgotPassword } from "@/api/auth";
import { errorMessage } from "@/api/client";

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onFinish(values: { email: string }) {
    setLoading(true);
    setError(null);
    try {
      await forgotPassword(values.email);
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f5" }}>
      <Card style={{ width: 400 }}>
        <Typography.Title level={3} style={{ textAlign: "center" }}>
          Сброс пароля
        </Typography.Title>
        {sent ? (
          <Alert
            type="success"
            showIcon
            message="Проверьте почту"
            description="Если такой email зарегистрирован, мы отправили на него ссылку для сброса пароля. Ссылка действует один час."
          />
        ) : (
          <>
            {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
            <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
              <Form.Item
                name="email"
                label="Email вашего аккаунта"
                rules={[
                  { required: true, message: "Введите email" },
                  { type: "email", message: "Некорректный email" },
                ]}
              >
                <Input prefix={<MailOutlined />} autoComplete="email" />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={loading}>
                Отправить ссылку
              </Button>
            </Form>
          </>
        )}
        <div style={{ marginTop: 16, textAlign: "center" }}>
          <Link to="/login">Вернуться ко входу</Link>
        </div>
      </Card>
    </div>
  );
}
