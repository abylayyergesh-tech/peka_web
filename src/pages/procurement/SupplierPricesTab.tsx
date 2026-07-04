/** Supplier price list tab: view + add/delete prices (cap price.manage). */
import { PlusOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  DatePicker,
  Form,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import { addPrice, deletePrice, listPrices, type SupplierPriceOut } from "@/api/procurement";
import { useCan } from "@/auth/store";
import { fmtDate, Money } from "@/components/format";
import { useProductRefs, useUnitRefs } from "@/pages/procurement/refData";

interface PriceFormValues {
  product_id: number;
  unit_id: number;
  price: string;
  valid_from?: Dayjs | null;
  valid_to?: Dayjs | null;
}

export default function SupplierPricesTab({ supplierId }: { supplierId: number }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("price.manage");
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<PriceFormValues>();
  const products = useProductRefs();
  const units = useUnitRefs();
  const productId = Form.useWatch("product_id", form);

  const query = useQuery({
    queryKey: ["supplier-prices", supplierId],
    queryFn: () => listPrices(supplierId),
  });

  const save = useMutation({
    mutationFn: (v: PriceFormValues) =>
      addPrice(supplierId, {
        product_id: v.product_id,
        unit_id: v.unit_id,
        price: v.price,
        valid_from: v.valid_from ? v.valid_from.format("YYYY-MM-DD") : null,
        valid_to: v.valid_to ? v.valid_to.format("YYYY-MM-DD") : null,
      }),
    onSuccess: () => {
      message.success("Цена добавлена");
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["supplier-prices", supplierId] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (priceId: number) => deletePrice(supplierId, priceId),
    onSuccess: () => {
      message.success("Цена удалена");
      queryClient.invalidateQueries({ queryKey: ["supplier-prices", supplierId] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const columns: ColumnsType<SupplierPriceOut> = [
    {
      title: "Продукт",
      dataIndex: "product_id",
      render: (v: number) => products.byId.get(v)?.name ?? `#${v}`,
    },
    {
      title: "Ед. изм.",
      dataIndex: "unit_id",
      width: 110,
      render: (v: number) => units.byId.get(v)?.name ?? `#${v}`,
    },
    {
      title: "Цена",
      dataIndex: "price",
      width: 140,
      align: "right",
      render: (v: string) => <Money value={v} />,
    },
    {
      title: "Действует с",
      dataIndex: "valid_from",
      width: 120,
      render: (v: string | null) => fmtDate(v),
    },
    {
      title: "Действует по",
      dataIndex: "valid_to",
      width: 120,
      render: (v: string | null) => fmtDate(v),
    },
    {
      title: "",
      width: 90,
      render: (_, row) =>
        canManage && (
          <Popconfirm
            title="Удалить цену?"
            okText="Да"
            cancelText="Отмена"
            onConfirm={() => remove.mutate(row.id)}
          >
            <a style={{ color: "#cf1322" }}>Удалить</a>
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
          Добавить цену
        </Button>
      )}
      <Table
        rowKey="id"
        size="small"
        loading={query.isPending}
        dataSource={query.data}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        columns={columns}
      />
      <Modal
        title="Новая цена"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={save.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Form.Item
            name="product_id"
            label="Продукт"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={products.options}
              loading={products.isPending}
              placeholder="Выберите продукт"
              onChange={(v: number) => {
                const product = products.byId.get(v);
                if (product) form.setFieldValue("unit_id", product.base_unit_id);
              }}
            />
          </Form.Item>
          <Form.Item
            name="unit_id"
            label="Единица измерения"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={units.optionsForProduct(products.get(productId))}
              loading={units.isPending}
              placeholder="Единица"
            />
          </Form.Item>
          <Form.Item
            name="price"
            label="Цена"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <InputNumber<string> stringMode min="0.0001" style={{ width: "100%" }} />
          </Form.Item>
          <Space>
            <Form.Item name="valid_from" label="Действует с">
              <DatePicker format="DD.MM.YYYY" />
            </Form.Item>
            <Form.Item name="valid_to" label="Действует по">
              <DatePicker format="DD.MM.YYYY" />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
