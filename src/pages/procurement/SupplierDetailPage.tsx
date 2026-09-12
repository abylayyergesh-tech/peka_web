/** /suppliers/:id — supplier card with price list / payments / ledger tabs. */
import { EditOutlined } from "@ant-design/icons";
import { Alert, App, Button, Descriptions, Form, Input, Modal, Space, Spin, Tabs, Tag } from "antd";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { errorMessage } from "@/api/client";
import { getSupplier, reportPayables, updateSupplier } from "@/api/procurement";
import { useCan } from "@/auth/store";
import { Money, fmtDateTime } from "@/components/format";
import { nullIfEmpty } from "@/pages/procurement/refData";
import SupplierLedgerTab from "@/pages/procurement/SupplierLedgerTab";
import SupplierPaymentsTab from "@/pages/procurement/SupplierPaymentsTab";
import SupplierPricesTab from "@/pages/procurement/SupplierPricesTab";

/** Долг — красным, переплата — зелёным. */
function balanceColor(value: string | undefined): string | undefined {
  const n = Number(value ?? 0);
  return n > 0 ? "#cf1322" : n < 0 ? "#389e0d" : undefined;
}

export default function SupplierDetailPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const params = useParams();
  const supplierId = Number(params.id);
  const canReport = useCan("report.read");
  const canManage = useCan("supplier.manage");
  const [editOpen, setEditOpen] = useState(false);
  const [form] = Form.useForm();

  const query = useQuery({
    queryKey: ["supplier", supplierId],
    queryFn: () => getSupplier(supplierId),
    enabled: Number.isFinite(supplierId),
  });

  // Счёт поставщика: получено / оплачено / разница. Тот же источник, что и отчёт
  // «Кредиторка», просто с фильтром по одному поставщику.
  const account = useQuery({
    queryKey: ["payables", { supplier: supplierId }],
    queryFn: () => reportPayables({ supplier: supplierId }),
    enabled: Number.isFinite(supplierId) && canReport,
  });
  const row = account.data?.[0];

  const save = useMutation({
    mutationFn: (v: { name: string; tax_id?: string; phone?: string; email?: string; note?: string }) =>
      updateSupplier(supplierId, {
        name: v.name,
        tax_id: nullIfEmpty(v.tax_id),
        phone: nullIfEmpty(v.phone),
        email: nullIfEmpty(v.email),
        note: nullIfEmpty(v.note),
      }),
    onSuccess: () => {
      message.success("Сохранено");
      setEditOpen(false);
      queryClient.invalidateQueries({ queryKey: ["supplier", supplierId] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  if (query.isPending) return <Spin style={{ display: "block", margin: "48px auto" }} />;
  if (query.isError) {
    return <Alert type="error" showIcon message={errorMessage(query.error)} />;
  }
  const supplier = query.data;

  return (
    <div>
      <Space
        className="no-print"
        style={{ marginBottom: 8, justifyContent: "space-between", width: "100%" }}
        align="center"
      >
        <Space>
          <h2 style={{ margin: 0 }}>{supplier.name}</h2>
          {supplier.is_active ? (
            <Tag color="green">Активен</Tag>
          ) : (
            <Tag color="red">Неактивен</Tag>
          )}
        </Space>
        {canManage && (
          <Button
            type="primary"
            icon={<EditOutlined />}
            onClick={() => {
              form.setFieldsValue({
                name: supplier.name,
                tax_id: supplier.tax_id ?? undefined,
                phone: supplier.phone ?? undefined,
                email: supplier.email ?? undefined,
                note: supplier.note ?? undefined,
              });
              setEditOpen(true);
            }}
          >
            Редактировать
          </Button>
        )}
      </Space>
      <div className="no-print" style={{ marginBottom: 16 }}>
        <Link to="/suppliers">← К списку поставщиков</Link>
      </div>
      <Descriptions
        className="no-print"
        size="small"
        column={2}
        bordered
        style={{ marginBottom: 24 }}
      >
        <Descriptions.Item label="ИНН/БИН">{supplier.tax_id ?? "—"}</Descriptions.Item>
        <Descriptions.Item label="Телефон">{supplier.phone ?? "—"}</Descriptions.Item>
        <Descriptions.Item label="Email">{supplier.email ?? "—"}</Descriptions.Item>
        <Descriptions.Item label="Создан">{fmtDateTime(supplier.created_at)}</Descriptions.Item>
        <Descriptions.Item label="Получено (дебет)">
          {canReport ? <Money value={row?.total_received} /> : "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Оплачено (кредит)">
          {canReport ? <Money value={row?.total_paid} /> : "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Разница (долг)" span={2}>
          {canReport ? (
            <b style={{ color: balanceColor(row?.balance) }}>
              <Money value={row?.balance} />
            </b>
          ) : (
            "—"
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Примечание" span={2}>
          {supplier.note ?? "—"}
        </Descriptions.Item>
      </Descriptions>
      <Tabs
        defaultActiveKey="prices"
        items={[
          {
            key: "prices",
            label: "Прайс-лист",
            children: <SupplierPricesTab supplierId={supplierId} />,
          },
          {
            key: "payments",
            label: "Платежи",
            children: <SupplierPaymentsTab supplierId={supplierId} />,
          },
          ...(canReport
            ? [
                {
                  key: "ledger",
                  label: "Взаиморасчёты",
                  children: <SupplierLedgerTab supplierId={supplierId} />,
                },
              ]
            : []),
        ]}
      />
      <Modal
        title="Редактировать поставщика"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
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
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Input maxLength={256} />
          </Form.Item>
          <Form.Item name="tax_id" label="ИНН/БИН">
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item name="phone" label="Телефон">
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item
            name="email"
            label="Email"
            rules={[{ type: "email", message: "Некорректный email" }]}
          >
            <Input maxLength={256} />
          </Form.Item>
          <Form.Item name="note" label="Примечание">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
