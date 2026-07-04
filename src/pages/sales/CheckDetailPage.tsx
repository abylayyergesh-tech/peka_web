/** /checks/:id — check card: lines CRUD while open, discount/customer,
 * close (payment), void, text receipt drawer + print. */
import { ArrowLeftOutlined, PlusOutlined, PrinterOutlined } from "@ant-design/icons";
import {
  Alert, App, Button, Card, Descriptions, Drawer, Form, InputNumber, Modal,
  Popconfirm, Radio, Result, Select, Space, Spin, Table,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  addCheckLine, closeCheck, getCheck, getReceipt, listCustomers, listMenuItems,
  listProductsLookup, listWarehousesLookup, printReceipt, removeCheckLine,
  updateCheck, updateCheckLine, voidCheck,
  type CheckCloseIn, type CheckDiscountIn, type CheckLineIn, type CheckLineOut,
  type CheckWarning,
} from "@/api/sales";
import { useCan } from "@/auth/store";
import { Money, fmtMoney, fmtQty } from "@/components/format";
import { CheckStatusTag, paymentMethodLabel } from "@/pages/sales/statusTags";

const DISCOUNT_TYPE_OPTIONS = [
  { value: "percent", label: "Процент" },
  { value: "amount", label: "Сумма" },
];

function discountLabel(type: string | null, value: string | null): string {
  if (!type || value == null) return "—";
  return type === "percent" ? `${fmtQty(value)} %` : fmtMoney(value);
}

export default function CheckDetailPage() {
  const { id } = useParams();
  const checkId = Number(id);
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const canOperate = useCan("sale.operate");

  const [lineModalOpen, setLineModalOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<CheckLineOut | null>(null);
  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [warnings, setWarnings] = useState<CheckWarning[]>([]);
  const [lineForm] = Form.useForm();
  const [discountForm] = Form.useForm();
  const [closeForm] = Form.useForm();
  const closePaymentMethod = Form.useWatch("payment_method", closeForm);

  const query = useQuery({
    queryKey: ["check", checkId],
    queryFn: () => getCheck(checkId),
    enabled: Number.isFinite(checkId) && canOperate,
  });

  const menuItems = useQuery({
    queryKey: ["menu-items-lookup"],
    queryFn: () => listMenuItems({ active: true, limit: 200 }),
    staleTime: 60_000,
  });

  const customers = useQuery({
    queryKey: ["customers-lookup"],
    queryFn: () => listCustomers({ active: true, limit: 200 }),
    staleTime: 60_000,
  });

  const warehouses = useQuery({
    queryKey: ["warehouses-lookup"],
    queryFn: listWarehousesLookup,
    staleTime: 60_000,
  });

  const products = useQuery({
    queryKey: ["products-lookup"],
    queryFn: listProductsLookup,
    staleTime: 60_000,
    enabled: warnings.length > 0,
  });

  const receipt = useQuery({
    queryKey: ["receipt", checkId],
    queryFn: () => getReceipt(checkId),
    enabled: receiptOpen,
  });

  function invalidateCheck() {
    queryClient.invalidateQueries({ queryKey: ["check", checkId] });
    queryClient.invalidateQueries({ queryKey: ["checks"] });
  }

  const lineSave = useMutation({
    mutationFn: (values: CheckLineIn) =>
      editingLine
        ? updateCheckLine(checkId, editingLine.id, values)
        : addCheckLine(checkId, values),
    onSuccess: () => {
      message.success(editingLine ? "Строка изменена" : "Строка добавлена");
      setLineModalOpen(false);
      invalidateCheck();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const lineRemove = useMutation({
    mutationFn: (lineId: number) => removeCheckLine(checkId, lineId),
    onSuccess: () => {
      message.success("Строка удалена");
      invalidateCheck();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const discountSave = useMutation({
    mutationFn: (values: CheckDiscountIn) => updateCheck(checkId, values),
    onSuccess: () => {
      message.success("Сохранено");
      setDiscountModalOpen(false);
      invalidateCheck();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const doVoid = useMutation({
    mutationFn: () => voidCheck(checkId),
    onSuccess: () => {
      message.success("Чек аннулирован");
      invalidateCheck();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const doClose = useMutation({
    mutationFn: (values: CheckCloseIn) => closeCheck(checkId, values),
    onSuccess: (result) => {
      message.success("Чек закрыт");
      setCloseModalOpen(false);
      setWarnings(result.warnings);
      invalidateCheck();
      queryClient.invalidateQueries({ queryKey: ["shift"] });
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const doPrint = useMutation({
    mutationFn: () => printReceipt(checkId),
    onSuccess: (rec) => {
      message.success(`Чек отправлен на печать (печатей: ${rec.print_count})`);
      queryClient.setQueryData(["receipt", checkId], rec);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  if (!canOperate) {
    return <Result status="403" title="Недостаточно прав" subTitle="Нужно право sale.operate" />;
  }
  if (query.isPending) return <Spin style={{ display: "block", margin: "48px auto" }} />;
  if (query.isError) {
    return <Result status="error" title="Чек не найден" subTitle={errorMessage(query.error)} />;
  }

  const check = query.data;
  const isOpen = check.status === "open";
  const warehouseName =
    warehouses.data?.items.find((w) => w.id === check.warehouse_id)?.name ??
    `#${check.warehouse_id}`;
  const customerName =
    check.customer_id == null
      ? "—"
      : customers.data?.items.find((c) => c.id === check.customer_id)?.name ??
        `#${check.customer_id}`;
  const menuItemName = (itemId: number) =>
    menuItems.data?.items.find((m) => m.id === itemId)?.name ?? `#${itemId}`;
  const productName = (productId: number) =>
    products.data?.items.find((p) => p.id === productId)?.name ?? `#${productId}`;

  function openAddLine() {
    setEditingLine(null);
    lineForm.resetFields();
    setLineModalOpen(true);
  }

  function openEditLine(line: CheckLineOut) {
    setEditingLine(line);
    lineForm.setFieldsValue({
      menu_item_id: line.menu_item_id,
      quantity: Number(line.quantity),
      discount_type: line.discount_type ?? undefined,
      discount_value: line.discount_value != null ? Number(line.discount_value) : undefined,
    });
    setLineModalOpen(true);
  }

  function openDiscount() {
    discountForm.setFieldsValue({
      discount_type: check.discount_type ?? undefined,
      discount_value: check.discount_value != null ? Number(check.discount_value) : undefined,
      customer_id: check.customer_id ?? undefined,
    });
    setDiscountModalOpen(true);
  }

  function openClose() {
    closeForm.setFieldsValue({ payment_method: "cash", customer_id: check.customer_id ?? undefined });
    setCloseModalOpen(true);
  }

  const lineColumns: ColumnsType<CheckLineOut> = [
    { title: "Позиция", dataIndex: "menu_item_id", render: (v: number) => menuItemName(v) },
    { title: "Кол-во", dataIndex: "quantity", align: "right", render: (v: string) => fmtQty(v) },
    {
      title: "Цена",
      dataIndex: "unit_price",
      align: "right",
      render: (v: string) => <Money value={v} />,
    },
    {
      title: "Скидка",
      align: "right",
      render: (_, row) => discountLabel(row.discount_type, row.discount_value),
    },
    {
      title: "Сумма",
      dataIndex: "line_total",
      align: "right",
      render: (v: string) => <Money value={v} />,
    },
  ];
  if (isOpen) {
    lineColumns.push({
      title: "",
      width: 160,
      render: (_, row) => (
        <Space>
          <a onClick={() => openEditLine(row)}>Изменить</a>
          <Popconfirm
            title="Удалить строку?"
            okText="Да"
            cancelText="Нет"
            onConfirm={() => lineRemove.mutate(row.id)}
          >
            <a>Удалить</a>
          </Popconfirm>
        </Space>
      ),
    });
  }

  const discountPairRule = ({ getFieldValue }: { getFieldValue: (name: string) => unknown }) => ({
    validator(_: unknown, value: unknown) {
      const type = getFieldValue("discount_type");
      if ((type == null) !== (value == null)) {
        return Promise.reject(new Error("Тип и размер скидки указываются вместе"));
      }
      if (type === "percent" && typeof value === "number" && value > 100) {
        return Promise.reject(new Error("Процент скидки не может превышать 100"));
      }
      return Promise.resolve();
    },
  });

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/checks")}>
            К чекам
          </Button>
          <h2 style={{ margin: 0 }}>
            Чек №{check.number ?? check.id} <CheckStatusTag status={check.status} />
          </h2>
        </Space>
        <Space wrap>
          {isOpen && (
            <>
              <Button onClick={openDiscount}>Скидка / клиент</Button>
              <Popconfirm
                title="Аннулировать чек?"
                okText="Аннулировать"
                cancelText="Отмена"
                onConfirm={() => doVoid.mutate()}
              >
                <Button danger loading={doVoid.isPending}>
                  Аннулировать
                </Button>
              </Popconfirm>
              <Button type="primary" onClick={openClose} disabled={check.lines.length === 0}>
                Закрыть чек
              </Button>
            </>
          )}
          {check.status === "paid" && (
            <Button icon={<PrinterOutlined />} onClick={() => setReceiptOpen(true)}>
              Чек
            </Button>
          )}
        </Space>
      </Space>

      {warnings.length > 0 && (
        <Alert
          type="warning"
          showIcon
          closable
          onClose={() => setWarnings([])}
          style={{ marginBottom: 16 }}
          message="Чек закрыт, но остатки на складе ушли в минус"
          description={
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {warnings.map((w, i) => (
                <li key={i}>
                  {productName(w.product_id)}: остаток {fmtQty(w.resulting_quantity)}
                  {w.cost_estimated ? " (себестоимость оценочная)" : ""}
                </li>
              ))}
            </ul>
          }
        />
      )}

      <Card size="small" style={{ marginBottom: 16 }}>
        <Descriptions size="small" column={3}>
          <Descriptions.Item label="Смена">
            <Link to={`/shifts/${check.shift_id}`}>№{check.shift_id}</Link>
          </Descriptions.Item>
          <Descriptions.Item label="Склад">{warehouseName}</Descriptions.Item>
          <Descriptions.Item label="Клиент">{customerName}</Descriptions.Item>
          <Descriptions.Item label="Оплата">
            {paymentMethodLabel(check.payment_method)}
          </Descriptions.Item>
          <Descriptions.Item label="Скидка на чек">
            {discountLabel(check.discount_type, check.discount_value)}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card
        title="Строки чека"
        size="small"
        extra={
          isOpen && (
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openAddLine}>
              Добавить строку
            </Button>
          )
        }
      >
        <Table
          rowKey="id"
          size="small"
          dataSource={check.lines}
          pagination={false}
          columns={lineColumns}
        />
        <Descriptions
          size="small"
          column={1}
          style={{ maxWidth: 320, marginLeft: "auto", marginTop: 16 }}
        >
          <Descriptions.Item label="Подытог">
            <Money value={check.subtotal} />
          </Descriptions.Item>
          <Descriptions.Item label="Скидка">
            <Money value={check.discount_total} />
          </Descriptions.Item>
          <Descriptions.Item label="Итого">
            <b>
              <Money value={check.total} />
            </b>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Modal
        title={editingLine ? "Изменить строку" : "Добавить строку"}
        open={lineModalOpen}
        onCancel={() => setLineModalOpen(false)}
        onOk={() => lineForm.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={lineSave.isPending}
        destroyOnClose
      >
        <Form form={lineForm} layout="vertical" onFinish={(v) => lineSave.mutate(v)}>
          <Form.Item
            name="menu_item_id"
            label="Позиция меню"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              loading={menuItems.isPending}
              options={menuItems.data?.items.map((m) => ({
                value: m.id,
                label: `${m.name} — ${fmtMoney(m.sale_price)}`,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="quantity"
            label="Количество"
            initialValue={1}
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <InputNumber min={0.000001} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="discount_type" label="Тип скидки">
            <Select allowClear options={DISCOUNT_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="discount_value"
            label="Размер скидки"
            dependencies={["discount_type"]}
            rules={[discountPairRule]}
          >
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Скидка на чек и клиент"
        open={discountModalOpen}
        onCancel={() => setDiscountModalOpen(false)}
        onOk={() => discountForm.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={discountSave.isPending}
        destroyOnClose
      >
        <Form
          form={discountForm}
          layout="vertical"
          onFinish={(v) =>
            discountSave.mutate({
              discount_type: v.discount_type ?? null,
              discount_value: v.discount_value ?? null,
              customer_id: v.customer_id ?? null,
            })
          }
        >
          <Form.Item name="discount_type" label="Тип скидки">
            <Select allowClear options={DISCOUNT_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="discount_value"
            label="Размер скидки"
            dependencies={["discount_type"]}
            rules={[discountPairRule]}
          >
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="customer_id" label="Клиент">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              loading={customers.isPending}
              options={customers.data?.items.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Закрыть чек"
        open={closeModalOpen}
        onCancel={() => setCloseModalOpen(false)}
        onOk={() => closeForm.submit()}
        okText="Закрыть чек"
        cancelText="Отмена"
        confirmLoading={doClose.isPending}
        destroyOnClose
      >
        <Descriptions size="small" column={1} style={{ marginBottom: 16 }}>
          <Descriptions.Item label="К оплате">
            <b>
              <Money value={check.total} />
            </b>
          </Descriptions.Item>
        </Descriptions>
        <Form form={closeForm} layout="vertical" onFinish={(v) => doClose.mutate(v)}>
          <Form.Item
            name="payment_method"
            label="Способ оплаты"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Radio.Group
              options={[
                { value: "cash", label: "Наличные" },
                { value: "card", label: "Карта" },
                { value: "credit", label: "В кредит" },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="customer_id"
            label="Клиент"
            rules={[
              {
                required: closePaymentMethod === "credit",
                message: "Для продажи в кредит нужен клиент",
              },
            ]}
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              loading={customers.isPending}
              options={customers.data?.items.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={`Чек №${check.number ?? check.id}`}
        open={receiptOpen}
        onClose={() => setReceiptOpen(false)}
        width={420}
        extra={
          <Button
            icon={<PrinterOutlined />}
            loading={doPrint.isPending}
            onClick={() => doPrint.mutate()}
          >
            Напечатать
          </Button>
        }
      >
        {receipt.isPending && <Spin />}
        {receipt.isError && <Alert type="error" message={errorMessage(receipt.error)} />}
        {receipt.data && (
          <pre style={{ fontFamily: "monospace", fontSize: 13, whiteSpace: "pre-wrap" }}>
            {receipt.data.content}
          </pre>
        )}
      </Drawer>
    </div>
  );
}
