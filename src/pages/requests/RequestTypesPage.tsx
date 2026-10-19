/** «Типы заявлений»: справочник, который ведёт HR (ТЗ, §12.2).
 *
 * Встроенные типы (аванс, отпуск, отгул, больничный, увольнение, справка и
 * кабинетные) переименовывают, ограничивают суммой, требуют фото документа,
 * прячут из приложения или выключают — но не удаляют и форму не меняют: у них
 * свой эффект согласования. Свои типы — название, форма подачи (сумма,
 * период, дата или ничего), лимит и вложение; согласование своего типа ничего
 * в учёте не меняет. Маршрут нового типа — «руководитель цеха → HR». */
import { PlusOutlined } from "@ant-design/icons";
import {
  App, Button, Col, Drawer, Form, Input, InputNumber, Row, Select, Space, Switch, Table, Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  createRequestType,
  updateRequestType,
  type AttachmentPolicy,
  type RequestKind,
  type RequestTypeOut,
} from "@/api/requests";
import { useCan } from "@/auth/store";
import { fmtMoney } from "@/components/format";
import RequestsSectionTabs from "@/pages/requests/RequestsSectionTabs";
import { REQUEST_KIND_LABELS, useRequestTypes } from "@/pages/requests/shared";

const ATTACHMENT_LABELS: Record<AttachmentPolicy, string> = {
  none: "Не нужно",
  optional: "По желанию",
  required: "Обязательно",
};

const KIND_OPTIONS = (["amount", "date_range", "single_date", "none"] as RequestKind[]).map(
  (k) => ({ value: k, label: REQUEST_KIND_LABELS[k] }),
);

interface FormValues {
  name_ru: string;
  name_kk?: string;
  description_ru?: string;
  description_kk?: string;
  kind: Exclude<RequestKind, "special">;
  amount_limit?: number | null;
  attachment: AttachmentPolicy;
  in_app: boolean;
  auto_payout?: boolean;
  is_active?: boolean;
}

export default function RequestTypesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("request.policy.manage");
  const { types, isPending } = useRequestTypes();
  const [editing, setEditing] = useState<RequestTypeOut | "new" | null>(null);
  const [form] = Form.useForm<FormValues>();
  const kind = Form.useWatch("kind", form);
  const current = editing && editing !== "new" ? editing : null;

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const body = {
        name_ru: v.name_ru,
        name_kk: v.name_kk || null,
        description_ru: v.description_ru || null,
        description_kk: v.description_kk || null,
        amount_limit: v.amount_limit != null ? String(v.amount_limit) : null,
        attachment: v.attachment,
        in_app: v.in_app,
      };
      if (editing === "new") return createRequestType({ ...body, kind: v.kind });
      return updateRequestType(current!.code, {
        ...body,
        ...(current!.is_builtin ? {} : { kind: v.kind }),
        ...(["advance", "loan", "vacation"].includes(current!.code)
          ? { auto_payout: !!v.auto_payout }
          : {}),
        is_active: v.is_active,
      });
    },
    onSuccess: () => {
      message.success(editing === "new" ? "Тип добавлен — маршрут «руководитель цеха → HR»" : "Сохранено");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["request-types"] });
      queryClient.invalidateQueries({ queryKey: ["approval-flows"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function open(t: RequestTypeOut | "new") {
    setEditing(t);
    form.resetFields();
    if (t === "new") {
      form.setFieldsValue({ kind: "none", attachment: "none", in_app: true });
    } else {
      form.setFieldsValue({
        name_ru: t.name_ru, name_kk: t.name_kk ?? undefined,
        description_ru: t.description_ru ?? undefined, description_kk: t.description_kk ?? undefined,
        kind: t.kind === "special" ? "none" : t.kind,
        amount_limit: t.amount_limit != null ? Number(t.amount_limit) : null,
        attachment: t.attachment, in_app: t.in_app, auto_payout: t.auto_payout,
        is_active: t.is_active,
      });
    }
  }

  const columns: ColumnsType<RequestTypeOut> = [
    {
      title: "Тип",
      dataIndex: "name_ru",
      render: (v: string, r) => (
        <Space direction="vertical" size={0}>
          <span>
            {v} {!r.is_active && <Tag>выключен</Tag>} {!r.is_builtin && <Tag color="purple">свой</Tag>}
          </span>
          {r.name_kk && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{r.name_kk}</Typography.Text>}
        </Space>
      ),
    },
    { title: "Форма", dataIndex: "kind", width: 120, render: (v: string) => REQUEST_KIND_LABELS[v] ?? v },
    { title: "Лимит", dataIndex: "amount_limit", width: 120, render: (v: string | null) => (v ? fmtMoney(v) : "—") },
    { title: "Фото документа", dataIndex: "attachment", width: 140,
      render: (v: AttachmentPolicy) => ATTACHMENT_LABELS[v] },
    { title: "В приложении", dataIndex: "in_app", width: 120,
      render: (v: boolean, r) => (r.kind === "special" ? <Tag>только кабинет</Tag> : v ? "да" : "нет") },
    { title: "Выплата при согласовании", dataIndex: "auto_payout", width: 190,
      render: (v: boolean, r) =>
        ["advance", "loan", "vacation"].includes(r.code) ? (v ? "сразу в реестр" : "бухгалтерия") : "—" },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 12, justifyContent: "space-between", width: "100%" }} align="start">
        <div>
          <p className="page-kicker">HR</p>
          <h1 className="page-title">Заявления</h1>
        </div>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => open("new")}>
            Новый тип
          </Button>
        )}
      </Space>
      <RequestsSectionTabs active="types" />
      <Typography.Paragraph type="secondary">
        Что сотрудник может подать из приложения. Встроенные типы не удаляются — их можно
        переименовать, ограничить или выключить. Кто согласует —{" "}
        <Link to="/approval-flows">«Маршруты согласования»</Link>.
      </Typography.Paragraph>
      <Table
        rowKey="request_type_id"
        size="small"
        loading={isPending}
        dataSource={types}
        columns={columns}
        pagination={false}
        rowClassName={() => (canManage ? "row-clickable" : "")}
        onRow={(r) => ({ onClick: () => canManage && open(r) })}
      />

      <Drawer
        width={560}
        open={editing != null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Новый тип заявления" : current?.name_ru}
        extra={
          <Button type="primary" loading={save.isPending} onClick={() => form.submit()}>
            Сохранить
          </Button>
        }
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="name_ru" label="Название (рус.)" rules={[{ required: true, whitespace: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="name_kk" label="Название (каз.)">
                <Input placeholder="как на русском" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="kind" label="Форма подачи"
            extra={current?.is_builtin
              ? "У встроенного типа форма своя — её не меняют"
              : "Что сотрудник заполняет в приложении"}>
            <Select options={KIND_OPTIONS} disabled={!!current?.is_builtin} />
          </Form.Item>
          {(kind === "amount" || current?.code === "advance" || current?.code === "loan") && (
            <Form.Item name="amount_limit" label="Лимит суммы, ₸" extra="Пусто — без лимита. Проверяется при подаче">
              <InputNumber min={1} step={1000} style={{ width: "100%" }} />
            </Form.Item>
          )}
          <Form.Item name="attachment" label="Фото документа"
            extra="«Обязательно» — без фото заявление из приложения не подать (например, больничный лист)">
            <Select options={Object.entries(ATTACHMENT_LABELS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="in_app" label="Подаётся из приложения" valuePropName="checked">
            <Switch disabled={current?.kind === "special"} />
          </Form.Item>
          {current && ["advance", "loan", "vacation"].includes(current.code) && (
            <Form.Item name="auto_payout" label="Выплата при согласовании" valuePropName="checked"
              extra="Выключено — согласованное ждёт бухгалтерию: «Заявления» → «Не выплачено» → «Выплатить»">
              <Switch />
            </Form.Item>
          )}
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="description_ru" label="Пояснение (рус.)">
                <Input.TextArea rows={3} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="description_kk" label="Пояснение (каз.)">
                <Input.TextArea rows={3} />
              </Form.Item>
            </Col>
          </Row>
          {current && (
            <Form.Item name="is_active" label="Действует" valuePropName="checked"
              extra="Выключенный тип нельзя подать; поданные заявления остаются">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Drawer>
    </div>
  );
}
