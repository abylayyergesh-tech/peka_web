/** /purchase-orders/:id — PO header + lines, draft editing, workflow actions. */
import {
  Alert,
  App,
  Button,
  DatePicker,
  Descriptions,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { errorMessage } from "@/api/client";
import {
  cancelPurchaseOrder,
  closePurchaseOrder,
  getPurchaseOrder,
  placePurchaseOrder,
  updatePurchaseOrder,
  type POLineOut,
  type PurchaseOrderOut,
} from "@/api/procurement";
import { useCan } from "@/auth/store";
import { fmtDate, fmtDateTime, fmtMoney, fmtQty, Money } from "@/components/format";
import POLinesFormList, { type POLineFormValue } from "@/pages/procurement/POLinesFormList";
import { nullIfEmpty, useProductRefs, useSupplierRefs, useUnitRefs, useWarehouseRefs } from "@/pages/procurement/refData";
import { POStatusTag } from "@/pages/procurement/statuses";

interface POEditFormValues {
  expected_date?: Dayjs | null;
  note?: string;
  lines: POLineFormValue[];
}

export default function PurchaseOrderDetailPage() {
  const params = useParams();
  const poId = Number(params.id);
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("purchase_order.manage");
  const [editOpen, setEditOpen] = useState(false);
  const [form] = Form.useForm<POEditFormValues>();
  const suppliers = useSupplierRefs();
  const warehouses = useWarehouseRefs();
  const products = useProductRefs();
  const units = useUnitRefs();

  const query = useQuery({
    queryKey: ["purchase-order", poId],
    queryFn: () => getPurchaseOrder(poId),
    enabled: Number.isFinite(poId),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["purchase-order", poId] });
    queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
  }

  const update = useMutation({
    mutationFn: (v: POEditFormValues) =>
      updatePurchaseOrder(poId, {
        expected_date: v.expected_date ? v.expected_date.format("YYYY-MM-DD") : null,
        note: nullIfEmpty(v.note),
        lines: v.lines.map((l) => ({
          product_id: l.product_id,
          unit_id: l.unit_id,
          quantity_ordered: l.quantity_ordered,
          price: l.price ?? null,
        })),
      }),
    onSuccess: () => {
      message.success("Заказ сохранён");
      setEditOpen(false);
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const place = useMutation({
    mutationFn: () => placePurchaseOrder(poId),
    onSuccess: () => {
      message.success("Заказ размещён");
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const close = useMutation({
    mutationFn: () => closePurchaseOrder(poId),
    onSuccess: () => {
      message.success("Заказ закрыт");
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const cancel = useMutation({
    mutationFn: () => cancelPurchaseOrder(poId),
    onSuccess: () => {
      message.success("Заказ отменён");
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  if (query.isPending) return <Spin style={{ display: "block", margin: "48px auto" }} />;
  if (query.isError) {
    return <Alert type="error" showIcon message={errorMessage(query.error)} />;
  }
  const po: PurchaseOrderOut = query.data;
  const fulfillmentByLine = new Map(po.fulfillment.map((f) => [f.line_id, f]));
  const total = po.lines.reduce(
    (sum, l) => sum + Number(l.quantity_ordered) * Number(l.price),
    0,
  );

  function openEdit() {
    form.setFieldsValue({
      expected_date: po.expected_date ? dayjs(po.expected_date) : null,
      note: po.note ?? undefined,
      lines: po.lines.map((l) => ({
        product_id: l.product_id,
        unit_id: l.unit_id,
        quantity_ordered: l.quantity_ordered,
        price: l.price,
      })),
    });
    setEditOpen(true);
  }

  const columns: ColumnsType<POLineOut> = [
    {
      title: "Продукт",
      dataIndex: "product_id",
      render: (v: number) => products.byId.get(v)?.name ?? `#${v}`,
    },
    {
      title: "Ед. изм.",
      dataIndex: "unit_id",
      width: 100,
      render: (v: number) => units.byId.get(v)?.name ?? `#${v}`,
    },
    {
      title: "Кол-во",
      dataIndex: "quantity_ordered",
      width: 110,
      align: "right",
      render: (v: string) => fmtQty(v),
    },
    {
      title: "Цена",
      dataIndex: "price",
      width: 130,
      align: "right",
      render: (v: string) => <Money value={v} />,
    },
    {
      title: "Сумма",
      width: 140,
      align: "right",
      render: (_, row) => <Money value={Number(row.quantity_ordered) * Number(row.price)} />,
    },
    {
      title: "Получено (баз. ед.)",
      width: 150,
      align: "right",
      render: (_, row) => {
        const f = fulfillmentByLine.get(row.purchase_order_line_id);
        return fmtQty(f ? f.received_base : row.received_base_qty);
      },
    },
    {
      title: "Выполнение",
      width: 150,
      render: (_, row) => {
        const f = fulfillmentByLine.get(row.purchase_order_line_id);
        if (!f) return "—";
        if (f.fully_received) return <Tag color="green">Полностью</Tag>;
        if (Number(f.received_base) > 0) return <Tag color="gold">Частично</Tag>;
        return <Tag>Не получено</Tag>;
      },
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 8, justifyContent: "space-between", width: "100%" }}>
        <Space align="center">
          <h2 style={{ margin: 0 }}>
            {po.number != null ? `Заказ № ${po.number}` : `Заказ #${po.purchase_order_id}`}
          </h2>
          <POStatusTag status={po.status} />
        </Space>
        {canManage && (
          <Space>
            {po.status === "draft" && (
              <>
                <Button onClick={openEdit}>Редактировать</Button>
                <Popconfirm
                  title="Разместить заказ?"
                  okText="Да"
                  cancelText="Отмена"
                  onConfirm={() => place.mutate()}
                >
                  <Button type="primary" loading={place.isPending}>
                    Разместить
                  </Button>
                </Popconfirm>
              </>
            )}
            {(po.status === "placed" || po.status === "partially_received") && (
              <Popconfirm
                title="Закрыть заказ?"
                okText="Да"
                cancelText="Отмена"
                onConfirm={() => close.mutate()}
              >
                <Button loading={close.isPending}>Закрыть</Button>
              </Popconfirm>
            )}
            {(po.status === "draft" || po.status === "placed") && (
              <Popconfirm
                title="Отменить заказ?"
                okText="Да"
                cancelText="Отмена"
                onConfirm={() => cancel.mutate()}
              >
                <Button danger loading={cancel.isPending}>
                  Отменить
                </Button>
              </Popconfirm>
            )}
          </Space>
        )}
      </Space>
      <div style={{ marginBottom: 16 }}>
        <Link to="/purchase-orders">← К списку заказов</Link>
      </div>
      <Descriptions size="small" column={2} bordered style={{ marginBottom: 24 }}>
        <Descriptions.Item label="Поставщик">
          <Link to={`/suppliers/${po.supplier_id}`}>
            {suppliers.byId.get(po.supplier_id) ?? `#${po.supplier_id}`}
          </Link>
        </Descriptions.Item>
        <Descriptions.Item label="Склад">
          {warehouses.byId.get(po.warehouse_id) ?? `#${po.warehouse_id}`}
        </Descriptions.Item>
        <Descriptions.Item label="Ожидаемая дата">{fmtDate(po.expected_date)}</Descriptions.Item>
        <Descriptions.Item label="Создан">{fmtDateTime(po.created_at)}</Descriptions.Item>
        <Descriptions.Item label="Сумма заказа">{fmtMoney(total)}</Descriptions.Item>
        <Descriptions.Item label="Примечание">{po.note ?? "—"}</Descriptions.Item>
      </Descriptions>
      <Table
        rowKey="purchase_order_line_id"
        size="small"
        dataSource={po.lines}
        pagination={false}
        columns={columns}
      />
      <Modal
        title="Редактирование заказа"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={() => form.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={update.isPending}
        width={800}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => update.mutate(v)}>
          <Form.Item name="expected_date" label="Ожидаемая дата">
            <DatePicker format="DD.MM.YYYY" />
          </Form.Item>
          <Form.Item name="note" label="Примечание">
            <Input.TextArea rows={2} />
          </Form.Item>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>Строки заказа</div>
          <POLinesFormList />
        </Form>
      </Modal>
    </div>
  );
}
