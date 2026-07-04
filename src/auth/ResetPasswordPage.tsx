/** Установка нового пароля по одноразовой ссылке из письма. */
import { LockOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Form, Input, Typography } from "antd";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { resetPassword } from "@/api/auth";
import { errorMessage } from "@/api/client";

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onFinish(values: { password: string }) {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      await resetPassword(token, values.password);
      setDone(true);
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
          Новый пароль
        </Typography.Title>
        {done ? (
          <Alert
            type="success"
            showIcon
            message="Пароль изменён"
            description={
              <>
                Все прежние сессии завершены. <Link to="/login">Войти с новым паролем</Link>
              </>
            }
          />
        ) : (
          <>
            {error && (
              <Alert
                type="error"
                style={{ marginBottom: 16 }}
                message={error}
                description="Возможно, ссылка устарела или уже использована — запросите новую."
              />
            )}
            <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
              <Form.Item
                name="password"
                label="Новый пароль"
                rules={[
                  { required: true, message: "Введите пароль" },
                  { min: 8, message: "Минимум 8 символов" },
                ]}
              >
                <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
              </Form.Item>
              <Form.Item
                name="confirm"
                label="Повторите пароль"
                dependencies={["password"]}
                rules={[
                  { required: true, message: "Повторите пароль" },
                  ({ getFieldValue }) => ({
                    validator: async (_, value) => {
                      if (value && value !== getFieldValue("password")) {
                        throw new Error("Пароли не совпадают");
                      }
                    },
                  }),
                ]}
              >
                <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={loading}>
                Сохранить пароль
              </Button>
            </Form>
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <Link to="/forgot-password">Запросить новую ссылку</Link>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
