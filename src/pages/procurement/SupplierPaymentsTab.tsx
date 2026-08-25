/** Supplier payments tab: list + record payment + void (cap payment.manage). */
import { PlusOutlined } from "@ant-design/icons";
import {
  App, Button, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Select, Table,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import { listPayments, recordPayment, voidPayment, type PaymentOut } from "@/api/procurement";
import { useCan } from "@/auth/store";
import {
  EntityTag,
  useCompanyEntities,
} from "@/pages/finance/companyEntities";
import { fmtDate, fmtDateTime, Money } from "@/components/format";
import { nullIfEmpty } from "@/pages/procurement/refData";
import { PaymentStatusTag } from "@/pages/procurement/statuses";

interface PaymentFormValues {
  payment_date: Dayjs;
  amount: string;
  method?: string;
  note?: string;
  /** С какого нашего юр. лица платим: его кредиторка и уменьшится. */
  company_entity_id?: number;
}

export default function SupplierPaymentsTab({ supplierId }: { supplierId: number }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("payment.manage");
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<PaymentFormValues>();
  const entities = useCompanyEntities();

  const query = useQuery({
    queryKey: ["supplier-payments", supplierId],
    queryFn: () => listPayments(supplierId),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["supplier-payments", supplierId] });
    queryClient.invalidateQueries({ queryKey: ["supplier-ledger", supplierId] });
    queryClient.invalidateQueries({ queryKey: ["payables"] });
    queryClient.invalidateQueries({ queryKey: ["company-money"] });
  }

  const save = useMutation({
    mutationFn: (v: PaymentFormValues) =>
      recordPayment(supplierId, {
        payment_date: v.payment_date.format("YYYY-MM-DD"),
        amount: v.amount,
        method: nullIfEmpty(v.method),
        note: nullIfEmpty(v.note),
        company_entity_id: v.company_entity_id,
      }),
    onSuccess: () => {
      message.success("Платёж зарегистрирован");
      setModalOpen(false);
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const doVoid = useMutation({
    mutationFn: (paymentId: number) => voidPayment(supplierId, paymentId),
    onSuccess: () => {
      message.success("Платёж аннулирован");
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const columns: ColumnsType<PaymentOut> = [
    { title: "Дата", dataIndex: "payment_date", width: 110, render: (v) => fmtDate(v) },
    {
      title: "Юр. лицо",
      dataIndex: "company_entity_id",
      width: 180,
      render: (id: number | null) => <EntityTag entities={entities.data} id={id} />,
    },
    {
      title: "Сумма",
      dataIndex: "amount",
      width: 140,
      align: "right",
      render: (v: string) => <Money value={v} />,
    },
    { title: "Способ", dataIndex: "method", width: 140, render: (v) => v ?? "—" },
    { title: "Примечание", dataIndex: "note", render: (v) => v ?? "—" },
    {
      title: "Статус",
      dataIndex: "status",
      width: 120,
      render: (v: PaymentOut["status"]) => <PaymentStatusTag status={v} />,
    },
    { title: "Создан", dataIndex: "created_at", width: 140, render: (v) => fmtDateTime(v) },
    {
      title: "",
      width: 130,
      render: (_, row) =>
        canManage &&
        row.status === "active" && (
          <Popconfirm
            title="Аннулировать платёж?"
            okText="Да"
            cancelText="Отмена"
            onConfirm={() => doVoid.mutate(row.supplier_payment_id)}
          >
            <a style={{ color: "#cf1322" }}>Аннулировать</a>
          </Popconfirm>
        ),
    },
  ];

  return (
    <div>
      {canManage && (
        <Button
          type="primary"
          icon={<PlusOutlined />}
          style={{ marginBottom: 16 }}
          onClick={() => {
            form.resetFields();
            setModalOpen(true);
          }}
        >
          Зарегистрировать платёж
        </Button>
      )}
      <Table
        rowKey="supplier_payment_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        columns={columns}
      />
      <Modal
        title="Новый платёж"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={save.isPending}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ payment_date: dayjs() }}
          onFinish={(v) => save.mutate(v)}
        >
          <Form.Item
            name="payment_date"
            label="Дата платежа"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <DatePicker format="DD.MM.YYYY" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="amount"
            label="Сумма"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <InputNumber<string> stringMode min="0.0001" style={{ width: "100%" }} />
          </Form.Item>
          {/* Платит конкретное наше юрлицо, и его кредиторка уменьшается. Пусто —
              бэкенд возьмёт компанию «по умолчанию»: иначе разрез появлялся бы
              только у платежей, где выбор не забыли. */}
          <Form.Item
            name="company_entity_id"
            label="Платим с юр. лица"
            tooltip="Уменьшится кредиторка именно этого юр. лица. Пусто — компания по умолчанию"
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="По умолчанию"
              loading={entities.isPending}
              options={(entities.data ?? [])
                .filter((e) => e.is_active)
                .map((e) => ({ value: e.company_entity_id, label: e.name }))}
            />
          </Form.Item>
          <Form.Item name="method" label="Способ оплаты">
            <Input maxLength={32} placeholder="наличные / перевод / карта" />
          </Form.Item>
          <Form.Item name="note" label="Примечание">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
