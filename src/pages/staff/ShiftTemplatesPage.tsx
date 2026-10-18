/** «Шаблоны смен»: «Дневная 08:00–20:00», «Ночная 20:00–08:00».
 *
 * Шаблон ставится в клетку графика. От его времени считаются окно прихода,
 * опоздание, ранний уход, переработка и неявка (правила — в «Правилах учёта»).
 * Конец раньше начала — смена ночная: кончается на следующие сутки и относится к
 * дню начала. Шаблон не удаляют, а скрывают: старые клетки продолжают на него
 * ссылаться. */
import { PlusOutlined } from "@ant-design/icons";
import { App, Button, Checkbox, Form, Input, Modal, Space, Switch, Table, Tag, TimePicker } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createShiftTemplate,
  listShiftTemplates,
  updateShiftTemplate,
  type ShiftTemplateOut,
} from "@/api/attendance";
import { errorMessage } from "@/api/client";
import { useCan } from "@/auth/store";
import { hhmm } from "@/pages/staff/shared";

interface FormValues {
  name: string;
  starts_at: Dayjs;
  ends_at: Dayjs;
}

function toTime(v: Dayjs): string {
  return v.format("HH:mm");
}

export default function ShiftTemplatesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("staff.manage");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [editing, setEditing] = useState<ShiftTemplateOut | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<FormValues>();

  const query = useQuery({
    queryKey: ["shift-templates", { includeInactive }],
    queryFn: () => listShiftTemplates(includeInactive),
  });

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const body = { name: v.name.trim(), starts_at: toTime(v.starts_at), ends_at: toTime(v.ends_at) };
      return editing ? updateShiftTemplate(editing.shift_template_id, body) : createShiftTemplate(body);
    },
    onSuccess: () => {
      message.success(editing ? "Шаблон сохранён" : "Шаблон добавлен");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["shift-templates"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const toggle = useMutation({
    mutationFn: (row: ShiftTemplateOut) =>
      updateShiftTemplate(row.shift_template_id, { is_active: !row.is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shift-templates"] }),
    onError: (e) => message.error(errorMessage(e)),
  });

  function openForm(row: ShiftTemplateOut | null) {
    setEditing(row);
    form.setFieldsValue(
      row
        ? {
            name: row.name,
            starts_at: dayjs(row.starts_at, "HH:mm:ss"),
            ends_at: dayjs(row.ends_at, "HH:mm:ss"),
          }
        : { name: "", starts_at: dayjs("08:00", "HH:mm"), ends_at: dayjs("20:00", "HH:mm") },
    );
    setOpen(true);
  }

  const columns: ColumnsType<ShiftTemplateOut> = [
    { title: "Название", dataIndex: "name" },
    {
      title: "Время",
      key: "time",
      render: (_, r) => (
        <Space size={4}>
          {hhmm(r.starts_at)}–{hhmm(r.ends_at)}
          {r.is_night && <Tag color="purple">ночная</Tag>}
        </Space>
      ),
    },
    {
      title: "Активен",
      dataIndex: "is_active",
      width: 110,
      render: (v: boolean, r) =>
        canManage ? (
          <Switch
            size="small"
            checked={v}
            onClick={(_, e) => e.stopPropagation()}
            onChange={() => toggle.mutate(r)}
          />
        ) : v ? (
          "да"
        ) : (
          "нет"
        ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <h2 style={{ margin: 0 }}>Шаблоны смен</h2>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm(null)}>
            Добавить
          </Button>
        )}
      </Space>
      <Checkbox
        style={{ marginBottom: 16 }}
        checked={includeInactive}
        onChange={(e) => setIncludeInactive(e.target.checked)}
      >
        Показывать скрытые
      </Checkbox>
      <Table
        rowKey="shift_template_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data}
        columns={columns}
        pagination={false}
        rowClassName={() => (canManage ? "row-clickable" : "")}
        onRow={(row) => ({ onClick: () => canManage && openForm(row) })}
      />
      <Modal
        title={editing ? "Шаблон смены" : "Новый шаблон смены"}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={save.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Form.Item
            name="name"
            label="Название"
            rules={[{ required: true, whitespace: true, message: "Обязательное поле" }]}
          >
            <Input maxLength={64} placeholder="Дневная" />
          </Form.Item>
          <Space>
            <Form.Item name="starts_at" label="Начало" rules={[{ required: true, message: "Укажите" }]}>
              <TimePicker format="HH:mm" minuteStep={5} />
            </Form.Item>
            <Form.Item name="ends_at" label="Конец" rules={[{ required: true, message: "Укажите" }]}>
              <TimePicker format="HH:mm" minuteStep={5} />
            </Form.Item>
          </Space>
          <div style={{ color: "#888" }}>Конец раньше начала — смена ночная, кончается на следующий день.</div>
        </Form>
      </Modal>
    </div>
  );
}
