/** Исправление и сторно закрытого чека.
 *
 * Закрытый чек на месте не правится: он уже списал склад и начислил долг.
 * «Исправить» делает сторно исходного чека и новый чек с правильным составом —
 * той же датой и в той же смене. «Сторно» только аннулирует чек: склад, долг
 * клиента и замены возвращаются, выданный им заказ отменяется. Причина
 * обязательна — она остаётся в чеке и в журнале действий. */
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import {
  Alert, App, Button, Checkbox, Form, Input, InputNumber, Modal, Radio, Select, Space,
  Typography,
} from "antd";
import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  correctCheck, stornoCheck,
  type CheckCloseResult, type CheckOut, type MenuItemOut,
} from "@/api/sales";
import { fmtMoney } from "@/components/format";

interface LineValues {
  menu_item_id?: number;
  quantity?: number;
  unit_price?: number | null;
  is_replacement?: boolean;
}

interface CorrectionValues {
  reason: string;
  payment_method: "cash" | "card" | "credit";
  lines: LineValues[];
}

export function CheckCorrectionModal({
  check,
  open,
  menuItems,
  onClose,
  onCorrected,
}: {
  check: CheckOut;
  open: boolean;
  menuItems: MenuItemOut[];
  onClose: () => void;
  onCorrected: (result: CheckCloseResult) => void;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<CorrectionValues>();
  const lines = Form.useWatch("lines", form) ?? [];

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      reason: "",
      payment_method: (check.payment_method as CorrectionValues["payment_method"]) ?? "cash",
      lines: check.lines.map((ln) => ({
        menu_item_id: ln.menu_item_id,
        quantity: Number(ln.quantity),
        unit_price: ln.is_replacement ? null : Number(ln.unit_price),
        is_replacement: ln.is_replacement,
      })),
    });
  }, [open, check, form]);

  const save = useMutation({
    mutationFn: (v: CorrectionValues) =>
      correctCheck(check.check_id, {
        reason: v.reason.trim(),
        payment_method: v.payment_method,
        lines: v.lines.map((ln) => ({
          menu_item_id: ln.menu_item_id!,
          quantity: ln.quantity!,
          unit_price: ln.is_replacement ? null : ln.unit_price ?? null,
          is_replacement: !!ln.is_replacement,
          // Скидки строк переносятся из исходного чека как были.
          ...(() => {
            const orig = check.lines.find((o) => o.menu_item_id === ln.menu_item_id);
            return orig?.discount_type && !ln.is_replacement
              ? { discount_type: orig.discount_type as "percent" | "amount",
                  discount_value: orig.discount_value }
              : {};
          })(),
        })),
      }),
    onSuccess: (result) => {
      message.success(`Чек исправлен: новый чек №${result.check.number}`);
      queryClient.invalidateQueries({ queryKey: ["check"] });
      queryClient.invalidateQueries({ queryKey: ["checks"] });
      queryClient.invalidateQueries({ queryKey: ["shift"] });
      onCorrected(result);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const estimate = lines.reduce(
    (sum, ln) => sum + (ln?.is_replacement ? 0 : (ln?.quantity ?? 0) * (ln?.unit_price ?? 0)),
    0,
  );
  const options = menuItems.map((m) => ({ value: m.menu_item_id, label: m.name }));

  return (
    <Modal
      open={open}
      title={`Исправить чек №${check.number ?? check.check_id}`}
      okText="Исправить чек"
      cancelText="Отмена"
      width={760}
      confirmLoading={save.isPending}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnClose
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="Старый чек будет сторнирован, вместо него — новый чек той же датой и в той же смене"
        description="Склад и долг клиента пересчитаются: вернётся списанное по старому чеку и спишется по новому."
      />
      <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
        <Form.List name="lines">
          {(fields, { add, remove }) => (
            <>
              {fields.map((f) => (
                <Space key={f.key} align="start" style={{ display: "flex" }} wrap>
                  <Form.Item name={[f.name, "menu_item_id"]} rules={[{ required: true, message: "Позиция" }]}
                    style={{ width: 280, marginBottom: 8 }}>
                    <Select showSearch optionFilterProp="label" options={options} placeholder="Позиция" />
                  </Form.Item>
                  <Form.Item name={[f.name, "quantity"]} rules={[{ required: true, message: "Кол-во" }]}
                    style={{ marginBottom: 8 }}>
                    <InputNumber min={0.001} placeholder="Кол-во" style={{ width: 100 }} />
                  </Form.Item>
                  <Form.Item name={[f.name, "unit_price"]} style={{ marginBottom: 8 }}
                    tooltip="Пусто — цена меню клиента">
                    <InputNumber min={0.01} placeholder="Цена" addonAfter="₸" style={{ width: 150 }}
                      disabled={!!lines[f.name]?.is_replacement} />
                  </Form.Item>
                  <Form.Item name={[f.name, "is_replacement"]} valuePropName="checked" style={{ marginBottom: 8 }}>
                    <Checkbox>Замена</Checkbox>
                  </Form.Item>
                  <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(f.name)}
                    disabled={fields.length <= 1} />
                </Space>
              ))}
              <Button icon={<PlusOutlined />} onClick={() => add({ quantity: 1 })} style={{ marginBottom: 12 }}>
                Добавить позицию
              </Button>
            </>
          )}
        </Form.List>
        <Typography.Paragraph type="secondary">
          Примерно по строкам: {fmtMoney(estimate)} (скидки, доставка и цены меню посчитает сервер)
        </Typography.Paragraph>
        <Form.Item name="payment_method" label="Оплата">
          <Radio.Group
            options={[
              { value: "cash", label: "Наличные" },
              { value: "card", label: "Карта" },
              { value: "credit", label: "В долг (по счёту)", disabled: check.customer_id == null },
            ]}
          />
        </Form.Item>
        <Form.Item name="reason" label="Причина исправления"
          rules={[{ required: true, min: 3, message: "Укажите причину (не короче 3 символов)" }]}>
          <Input.TextArea rows={2} maxLength={1000} placeholder="Например: вернули 2 торта" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export function CheckStornoModal({
  check,
  open,
  onClose,
  onDone,
}: {
  check: CheckOut;
  open: boolean;
  onClose: () => void;
  onDone: (check: CheckOut) => void;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<{ reason: string }>();
  const run = useMutation({
    mutationFn: (v: { reason: string }) => stornoCheck(check.check_id, v.reason.trim()),
    onSuccess: (out) => {
      message.success("Чек сторнирован");
      queryClient.invalidateQueries({ queryKey: ["check"] });
      queryClient.invalidateQueries({ queryKey: ["checks"] });
      queryClient.invalidateQueries({ queryKey: ["shift"] });
      onDone(out);
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  return (
    <Modal
      open={open}
      title={`Сторно чека №${check.number ?? check.check_id}`}
      okText="Сторнировать"
      okButtonProps={{ danger: true }}
      cancelText="Отмена"
      confirmLoading={run.isPending}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnClose
    >
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 12 }}
        message="Чек будет аннулирован"
        description="Списанное вернётся на склад, долг клиента уменьшится на сумму чека, замены уйдут из журнала. Если чек закрывал заказ — заказ отменится."
      />
      <Form form={form} layout="vertical" onFinish={(v) => run.mutate(v)}>
        <Form.Item name="reason" label="Причина"
          rules={[{ required: true, min: 3, message: "Укажите причину (не короче 3 символов)" }]}>
          <Input.TextArea rows={2} maxLength={1000} placeholder="Например: пробили по ошибке" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
