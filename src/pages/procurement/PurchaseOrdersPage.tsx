/** /purchase-orders — PO list with status/supplier filters + create modal. */
import { PlusOutlined } from "@ant-design/icons";
import { App, Button, DatePicker, Form, Input, Modal, Select, Space, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";

import { errorMessage } from "@/api/client";
import {
  createPurchaseOrder,
  listPurchaseOrders,
  type POStatus,
  type PurchaseOrderOut,
} from "@/api/procurement";
import { useCan } from "@/auth/store";
import { fmtDate, fmtDateTime } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import POLinesFormList, { type POLineFormValue } from "@/pages/procurement/POLinesFormList";
import { nullIfEmpty, useSupplierRefs, useWarehouseRefs } from "@/pages/procurement/refData";
import { PO_STATUS_OPTIONS, POStatusTag } from "@/pages/procurement/statuses";

interface POCreateFormValues {
  supplier_id: number;
  warehouse_id: number;
  expected_date?: Dayjs | null;
  note?: string;
  lines: POLineFormValue[];
}

export default function PurchaseOrdersPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManage = useCan("purchase_order.manage");
  const { limit, offset, tablePagination, reset } = usePagination();
  const [status, setStatus] = useState<POStatus | undefined>(undefined);
  const [supplier, setSupplier] = useState<number | undefined>(undefined);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<POCreateFormValues>();
  const suppliers = useSupplierRefs();
  const warehouses = useWarehouseRefs();

  const query = useQuery({
    queryKey: ["purchase-orders", { limit, offset, status, supplier }],
    queryFn: () => listPurchaseOrders({ limit, offset, status, supplier }),
  });

  const create = useMutation({
    mutationFn: (v: POCreateFormValues) =>
      createPurchaseOrder({
        supplier_id: v.supplier_id,
        warehouse_id: v.warehouse_id,
        expected_date: v.expected_date ? v.expected_date.format("YYYY-MM-DD") : null,
        note: nullIfEmpty(v.note),
        lines: v.lines.map((l) => ({
          product_id: l.product_id,
          unit_id: l.unit_id,
          quantity_ordered: l.quantity_ordered,
          price: l.price ?? null,
        })),
      }),
    onSuccess: (po) => {
      message.success("Заказ создан");
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      navigate(`/purchase-orders/${po.id}`);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const columns: ColumnsType<PurchaseOrderOut> = [
    {
      title: "№",
      dataIndex: "number",
      width: 110,
      render: (_, row) => (
        <Link to={`/purchase-orders/${row.id}`}>
          {row.number != null ? `№ ${row.number}` : `#${row.id}`}
        </Link>
      ),
    },
    {
      title: "Поставщик",
      dataIndex: "supplier_id",
      render: (v: number) => suppliers.byId.get(v) ?? `#${v}`,
    },
    {
      title: "Склад",
      dataIndex: "warehouse_id",
      render: (v: number) => warehouses.byId.get(v) ?? `#${v}`,
    },
    {
      title: "Статус",
      dataIndex: "status",
      width: 150,
      render: (v: POStatus) => <POStatusTag status={v} />,
    },
    {
      title: "Ожидается",
      dataIndex: "expected_date",
      width: 110,
      render: (v: string | null) => fmtDate(v),
    },
    {
      title: "Создан",
      dataIndex: "created_at",
      width: 140,
      render: (v: string) => fmtDateTime(v),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <Space wrap>
          <h2 style={{ margin: 0 }}>Заказы поставщикам</h2>
          <Select
            allowClear
            placeholder="Статус"
            style={{ width: 180 }}
            value={status}
            onChange={(v) => {
              setStatus(v);
              reset();
            }}
            options={PO_STATUS_OPTIONS}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Поставщик"
            style={{ width: 220 }}
            value={supplier}
            onChange={(v) => {
              setSupplier(v);
              reset();
            }}
            options={suppliers.options}
            loading={suppliers.isPending}
          />
        </Space>
        {canManage && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              setModalOpen(true);
            }}
          >
            Новый заказ
          </Button>
        )}
      </Space>
      <Table
        rowKey="id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        pagination={tablePagination(query.data?.total)}
        columns={columns}
      />
      <Modal
        title="Новый заказ поставщику"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Создать"
        cancelText="Отмена"
        confirmLoading={create.isPending}
        width={800}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ lines: [{}] }}
          onFinish={(v) => create.mutate(v)}
        >
          <Space style={{ display: "flex" }} align="start">
            <Form.Item
              name="supplier_id"
              label="Поставщик"
              style={{ width: 320 }}
              rules={[{ required: true, message: "Обязательное поле" }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                options={suppliers.activeOptions}
                loading={suppliers.isPending}
                placeholder="Выберите поставщика"
              />
            </Form.Item>
            <Form.Item
              name="warehouse_id"
              label="Склад"
              style={{ width: 220 }}
              rules={[{ required: true, message: "Обязательное поле" }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                options={warehouses.options}
                loading={warehouses.isPending}
                placeholder="Склад поставки"
              />
            </Form.Item>
            <Form.Item name="expected_date" label="Ожидаемая дата">
              <DatePicker format="DD.MM.YYYY" />
            </Form.Item>
          </Space>
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
