/** «Правила учёта»: пороги учёта рабочего времени организации (ТЗ, экран
 * «Настройки»). Их применяют отметка в приложении, график и табель — менять
 * здесь, а не в коде. Нет сохранённых правил — действуют значения из ТЗ.
 * Требует attendance.manage. */
import { App, Button, Card, Col, Form, Input, InputNumber, Row, Skeleton, Space } from "antd";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getAttendanceSettings,
  saveAttendanceSettings,
  type AttendanceSettings,
} from "@/api/attendance";
import { errorMessage } from "@/api/client";
import { useCan } from "@/auth/store";

interface Field {
  name: keyof AttendanceSettings;
  label: string;
  extra: string;
  suffix: string;
  min: number;
  max: number;
}

const SHIFT_FIELDS: Field[] = [
  {
    name: "clock_in_window_min",
    label: "Окно прихода",
    extra: "Кнопка «Приход» открывается за столько минут до начала смены",
    suffix: "мин",
    min: 0,
    max: 1440,
  },
  {
    name: "late_grace_min",
    label: "Опоздание",
    extra: "Приход позже начала смены больше чем на столько минут — опоздание",
    suffix: "мин",
    min: 0,
    max: 1440,
  },
  {
    name: "early_leave_grace_min",
    label: "Ранний уход",
    extra: "Уход раньше конца смены больше чем на столько минут — ранний уход",
    suffix: "мин",
    min: 0,
    max: 1440,
  },
  {
    name: "overtime_after_min",
    label: "Переработка",
    extra: "Уход позже конца смены больше чем на столько минут — переработка, её подтверждает руководитель",
    suffix: "мин",
    min: 0,
    max: 1440,
  },
  {
    name: "no_show_after_min",
    label: "Неявка",
    extra: "Нет прихода через столько минут после начала смены — неявка",
    suffix: "мин",
    min: 0,
    max: 1440,
  },
  {
    name: "auto_close_after_min",
    label: "Нет отметки ухода",
    extra: "Смена без ухода закрывается системой через столько минут после конца",
    suffix: "мин",
    min: 0,
    max: 1440,
  },
];

const OTHER_FIELDS: Field[] = [
  {
    name: "onboarding_grace_days",
    label: "Переходный период онбординга",
    extra: "Сколько дней работавшие до запуска онбординга могут отмечаться, не пройдя его. Столько же дней даётся на повторный инструктаж и новую версию",
    suffix: "дн.",
    min: 0,
    max: 365,
  },
  {
    name: "photo_retention_days",
    label: "Хранение селфи отметок",
    extra: "Через столько дней фото отметок удаляются",
    suffix: "дн.",
    min: 1,
    max: 3650,
  },
];

export default function AttendanceSettingsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("attendance.manage");
  const [form] = Form.useForm<AttendanceSettings>();

  const query = useQuery({ queryKey: ["attendance-settings"], queryFn: getAttendanceSettings });

  useEffect(() => {
    if (query.data) form.setFieldsValue(query.data);
  }, [query.data, form]);

  const save = useMutation({
    mutationFn: (values: AttendanceSettings) =>
      saveAttendanceSettings({
        ...values,
        hr_contact_phone: values.hr_contact_phone?.trim() || null,
        hr_contact_whatsapp: values.hr_contact_whatsapp?.trim() || null,
      }),
    onSuccess: (data) => {
      message.success("Правила сохранены");
      queryClient.setQueryData(["attendance-settings"], data);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function numberField(f: Field) {
    return (
      <Col xs={24} md={12} key={f.name}>
        <Form.Item
          name={f.name}
          label={f.label}
          extra={f.extra}
          rules={[{ required: true, message: "Обязательное поле" }]}
        >
          <InputNumber
            min={f.min}
            max={f.max}
            addonAfter={f.suffix}
            disabled={!canManage}
            style={{ width: "100%" }}
          />
        </Form.Item>
      </Col>
    );
  }

  return (
    <div style={{ maxWidth: 960 }}>
      <h2>Правила учёта</h2>
      {query.isPending ? (
        <Skeleton active />
      ) : (
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Card title="Смена" size="small" style={{ marginBottom: 16 }}>
            <Row gutter={16}>{SHIFT_FIELDS.map(numberField)}</Row>
          </Card>
          <Card title="Онбординг и фото" size="small" style={{ marginBottom: 16 }}>
            <Row gutter={16}>{OTHER_FIELDS.map(numberField)}</Row>
          </Card>
          <Card title="Контакт HR в приложении" size="small" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item
                  name="hr_contact_phone"
                  label="Телефон"
                  extra="Кнопка «Позвонить» в «Настройках и помощи»"
                >
                  <Input placeholder="+7 700 000 00 00" maxLength={64} disabled={!canManage} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="hr_contact_whatsapp" label="WhatsApp" extra="Кнопка «WhatsApp»">
                  <Input placeholder="+7 700 000 00 00" maxLength={64} disabled={!canManage} />
                </Form.Item>
              </Col>
            </Row>
          </Card>
          {canManage && (
            <Space>
              <Button type="primary" htmlType="submit" loading={save.isPending}>
                Сохранить
              </Button>
              <Button onClick={() => query.data && form.setFieldsValue(query.data)}>
                Отменить изменения
              </Button>
            </Space>
          )}
        </Form>
      )}
    </div>
  );
}
