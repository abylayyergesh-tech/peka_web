/** /portal-rules — правила заказа на клиентском сайте (cap customer.manage).
 *
 * Одна настройка на организацию: до скольки принимается заказ на завтра,
 * дозаказ на сегодня, ночная пауза, минимум и доставка. Свои минимум и порог
 * бесплатной доставки у отдельной точки задаются в карточке клиента → «Точки».
 *
 * Время — местное (пояс организации). Пауза может переходить через полночь:
 * 23:30–09:00 значит «с вечера до утра».
 */
import {
  Alert, App, Button, Card, Col, Form, InputNumber, Row, Space, Switch, Tag, TimePicker,
} from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  getPortalSettings, updatePortalSettings,
  type PortalSettingsOut, type PortalSettingsUpdate,
} from "@/api/sales";
import { useCan } from "@/auth/store";
import { fmtDate, fmtMoney } from "@/components/format";

interface RulesForm {
  cutoff_time: Dayjs | null;
  lead_days: number;
  max_days_ahead: number;
  same_day_until: Dayjs | null;
  pause_from: Dayjs | null;
  pause_until: Dayjs | null;
  min_order_total: number;
  free_delivery_threshold: number | null;
  delivery_fee: number;
  pickup_enabled: boolean;
  delivery_enabled: boolean;
}

/** "HH:MM:SS" → Dayjs (сегодняшняя дата не важна — TimePicker показывает время). */
function parseTime(v: string | null): Dayjs | null {
  if (!v) return null;
  const [h, m] = v.split(":").map(Number);
  return dayjs().startOf("day").hour(h).minute(m);
}

const formatTime = (v: Dayjs | null) => (v ? v.format("HH:mm") : null);
const hhmm = (v: string | null) => (v ? v.slice(0, 5) : null);

function toForm(s: PortalSettingsOut): RulesForm {
  return {
    cutoff_time: parseTime(s.cutoff_time),
    lead_days: s.lead_days,
    max_days_ahead: s.max_days_ahead,
    same_day_until: parseTime(s.same_day_until),
    pause_from: parseTime(s.pause_from),
    pause_until: parseTime(s.pause_until),
    min_order_total: Number(s.min_order_total),
    free_delivery_threshold:
      s.free_delivery_threshold == null ? null : Number(s.free_delivery_threshold),
    delivery_fee: Number(s.delivery_fee),
    pickup_enabled: s.pickup_enabled,
    delivery_enabled: s.delivery_enabled,
  };
}

export default function PortalRulesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("customer.manage");
  const [form] = Form.useForm<RulesForm>();

  const query = useQuery({ queryKey: ["portal-settings"], queryFn: getPortalSettings });

  useEffect(() => {
    if (query.data) form.setFieldsValue(toForm(query.data));
  }, [query.data, form]);

  const save = useMutation({
    mutationFn: (v: RulesForm) => {
      const body: PortalSettingsUpdate = {
        cutoff_time: formatTime(v.cutoff_time),
        lead_days: v.lead_days,
        max_days_ahead: v.max_days_ahead,
        same_day_until: formatTime(v.same_day_until),
        pause_from: formatTime(v.pause_from),
        pause_until: formatTime(v.pause_until),
        min_order_total: String(v.min_order_total ?? 0),
        free_delivery_threshold:
          v.free_delivery_threshold == null ? null : String(v.free_delivery_threshold),
        delivery_fee: String(v.delivery_fee ?? 0),
        pickup_enabled: v.pickup_enabled,
        delivery_enabled: v.delivery_enabled,
        // Пояс в форме не правим: он общий для организации.
        time_zone: query.data?.time_zone ?? "Asia/Almaty",
      };
      return updatePortalSettings(body);
    },
    onSuccess: (data) => {
      message.success("Правила сохранены — сайт применяет их сразу");
      queryClient.setQueryData(["portal-settings"], data);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const now = query.data;

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <h2 style={{ margin: 0 }}>Правила заказа на сайте</h2>
        {canManage && (
          <Button type="primary" loading={save.isPending} onClick={() => form.submit()}>
            Сохранить правила
          </Button>
        )}
      </Space>

      {now && (
        <Card size="small" style={{ marginBottom: 16 }} title="Сейчас на сайте">
          <Space size={[32, 8]} wrap>
            <span>
              Приём заказов:{" "}
              {now.is_paused
                ? <Tag color="red">пауза до {hhmm(now.pause_until)}</Tag>
                : <Tag color="green">открыт</Tag>}
            </span>
            <span>
              Дозаказ на сегодня:{" "}
              {now.is_same_day_open
                ? <Tag color="green">принимается до {hhmm(now.same_day_until)}</Tag>
                : <Tag>закрыт</Tag>}
            </span>
            <span>
              Можно заказать на:{" "}
              <b>{now.available_delivery_dates.map(fmtDate).join(", ")}</b>
            </span>
          </Space>
        </Card>
      )}

      <Form
        form={form}
        layout="vertical"
        disabled={!canManage || query.isPending}
        onFinish={(v) => save.mutate(v)}
      >
        <Row gutter={16}>
          <Col xs={24} lg={12}>
            <Card title="Сроки" style={{ marginBottom: 16 }}>
              <Form.Item
                name="cutoff_time"
                label="Заказ на ближайший день принимается до"
                tooltip="После этого времени ближайшая дата сдвигается на день. Пусто — без ограничения."
              >
                <TimePicker format="HH:mm" minuteStep={5} style={{ width: 160 }} />
              </Form.Item>
              <Space size="large">
                <Form.Item
                  name="lead_days"
                  label="Ближайшая дата — через (дней)"
                  tooltip="1 — заказ на завтра."
                  rules={[{ required: true, message: "Обязательное поле" }]}
                >
                  <InputNumber min={0} max={30} />
                </Form.Item>
                <Form.Item
                  name="max_days_ahead"
                  label="Сколько дат предлагать"
                  tooltip="1 — только ближайшую дату; 7 — неделю вперёд."
                  rules={[{ required: true, message: "Обязательное поле" }]}
                >
                  <InputNumber min={1} max={90} />
                </Form.Item>
              </Space>
              <Form.Item
                name="same_day_until"
                label="Дозаказ на сегодня принимается до"
                tooltip="Клиент может заказать доставку на сегодня до этого времени. Пусто — на сегодня заказать нельзя."
              >
                <TimePicker format="HH:mm" minuteStep={5} style={{ width: 160 }} />
              </Form.Item>
              <Form.Item
                label="Пауза приёма заказов"
                tooltip="В это время сайт не принимает заказы. Может переходить через полночь: 23:30–09:00. Оба поля пустые — круглосуточно."
                style={{ marginBottom: 0 }}
              >
                <Space>
                  <Form.Item name="pause_from" noStyle>
                    <TimePicker format="HH:mm" minuteStep={5} placeholder="с" style={{ width: 120 }} />
                  </Form.Item>
                  —
                  <Form.Item name="pause_until" noStyle>
                    <TimePicker format="HH:mm" minuteStep={5} placeholder="до" style={{ width: 120 }} />
                  </Form.Item>
                </Space>
              </Form.Item>
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title="Суммы и доставка" style={{ marginBottom: 16 }}>
              <Form.Item
                name="min_order_total"
                label="Минимальная сумма заказа на точку"
                tooltip="Сумма товаров без доставки. Свой минимум точки — в карточке клиента → «Точки»."
                rules={[{ required: true, message: "Обязательное поле" }]}
              >
                <InputNumber min={0} step={1000} style={{ width: 200 }} />
              </Form.Item>
              <Form.Item
                name="free_delivery_threshold"
                label="Бесплатная доставка от"
                tooltip="С этой суммы товаров доставка бесплатна. Пусто — доставка всегда платная."
              >
                <InputNumber min={0} step={1000} style={{ width: 200 }} />
              </Form.Item>
              <Form.Item
                name="delivery_fee"
                label="Стоимость доставки"
                rules={[{ required: true, message: "Обязательное поле" }]}
              >
                <InputNumber min={0} step={100} style={{ width: 200 }} />
              </Form.Item>
              <Space size="large">
                <Form.Item name="delivery_enabled" label="Доставка" valuePropName="checked">
                  <Switch />
                </Form.Item>
                <Form.Item name="pickup_enabled" label="Самовывоз" valuePropName="checked">
                  <Switch />
                </Form.Item>
              </Space>
            </Card>
          </Col>
        </Row>
      </Form>

      {now && (
        <Alert
          type="info"
          showIcon
          message="Как считается"
          description={
            `Минимум ${fmtMoney(now.min_order_total)} и доставка ` +
            (now.free_delivery_threshold == null
              ? `всегда ${fmtMoney(now.delivery_fee)}`
              : `${fmtMoney(now.delivery_fee)}, бесплатно от ${fmtMoney(now.free_delivery_threshold)}`) +
            " — для каждой точки, если в её карточке не заданы свои условия. " +
            "Доп. заказ (галочка на сайте, «Объявления») минимума не требует."
          }
        />
      )}
    </div>
  );
}
