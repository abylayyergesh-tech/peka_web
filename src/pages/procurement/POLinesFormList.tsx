/** Reusable Form.List editor for purchase-order lines (create + draft edit). */
import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Form, InputNumber, Select } from "antd";

import { useProductRefs, useUnitRefs } from "@/pages/procurement/refData";

/** Shape of one row after validation (matches POLineIn). */
export interface POLineFormValue {
  product_id: number;
  unit_id: number;
  quantity_ordered: string;
  price?: string | null;
}

export default function POLinesFormList() {
  const form = Form.useFormInstance();
  const products = useProductRefs();
  const units = useUnitRefs();
  const lines = Form.useWatch<Partial<POLineFormValue>[] | undefined>("lines", form);

  return (
    <Form.List
      name="lines"
      rules={[
        {
          validator: (_, value) =>
            value && value.length > 0
              ? Promise.resolve()
              : Promise.reject(new Error("Добавьте хотя бы одну строку")),
        },
      ]}
    >
      {(fields, { add, remove }, { errors }) => (
        <>
          {fields.map(({ key, name }) => (
            <div key={key} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <Form.Item
                name={[name, "product_id"]}
                style={{ flex: 3, marginBottom: 8 }}
                rules={[{ required: true, message: "Продукт" }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  options={products.options}
                  loading={products.isPending}
                  placeholder="Продукт"
                  onChange={(v: number) => {
                    const product = products.byId.get(v);
                    if (product) form.setFieldValue(["lines", name, "unit_id"], product.base_unit_id);
                  }}
                />
              </Form.Item>
              <Form.Item
                name={[name, "unit_id"]}
                style={{ flex: 2, marginBottom: 8 }}
                rules={[{ required: true, message: "Ед. изм." }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  options={units.optionsForProduct(products.get(lines?.[name]?.product_id))}
                  loading={units.isPending}
                  placeholder="Ед. изм."
                />
              </Form.Item>
              <Form.Item
                name={[name, "quantity_ordered"]}
                style={{ flex: 2, marginBottom: 8 }}
                rules={[{ required: true, message: "Кол-во" }]}
              >
                <InputNumber<string>
                  stringMode
                  min="0.000001"
                  placeholder="Кол-во"
                  style={{ width: "100%" }}
                />
              </Form.Item>
              <Form.Item name={[name, "price"]} style={{ flex: 2, marginBottom: 8 }}>
                <InputNumber<string>
                  stringMode
                  min="0"
                  placeholder="Цена (из прайса)"
                  style={{ width: "100%" }}
                />
              </Form.Item>
              <Button
                type="text"
                icon={<MinusCircleOutlined />}
                aria-label="Удалить строку"
                onClick={() => remove(name)}
              />
            </div>
          ))}
          <Form.Item style={{ marginBottom: 8 }}>
            <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add()}>
              Добавить строку
            </Button>
            <Form.ErrorList errors={errors} />
          </Form.Item>
        </>
      )}
    </Form.List>
  );
}
