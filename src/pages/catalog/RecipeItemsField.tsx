/** Editable ingredient rows for a recipe (shared by create modal + editor).
 * Renders a Form.List named "items"; each row = component product + quantity +
 * unit. Enforces at least one row. */
import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Form, InputNumber, Select, Space } from "antd";

import type { IdOption } from "@/pages/catalog/useCatalogOptions";

interface Props {
  productOptions: IdOption[];
  productsLoading: boolean;
  unitOptions: IdOption[];
  unitsLoading: boolean;
}

export default function RecipeItemsField({
  productOptions,
  productsLoading,
  unitOptions,
  unitsLoading,
}: Props) {
  return (
    <Form.List
      name="items"
      rules={[
        {
          validator: async (_, items) => {
            if (!items || items.length < 1) {
              return Promise.reject(new Error("Добавьте хотя бы один ингредиент"));
            }
          },
        },
      ]}
    >
      {(fields, { add, remove }, { errors }) => (
        <>
          {fields.map(({ key, name, ...restField }) => (
            <Space key={key} align="baseline" style={{ display: "flex" }}>
              <Form.Item
                {...restField}
                name={[name, "component_product_id"]}
                rules={[{ required: true, message: "Ингредиент" }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  loading={productsLoading}
                  options={productOptions}
                  placeholder="Ингредиент"
                  style={{ width: 260 }}
                />
              </Form.Item>
              <Form.Item
                {...restField}
                name={[name, "quantity"]}
                rules={[
                  { required: true, message: "Кол-во" },
                  {
                    validator: (_, value: string) =>
                      value != null && Number(value) > 0
                        ? Promise.resolve()
                        : Promise.reject(new Error("> 0")),
                  },
                ]}
              >
                <InputNumber
                  stringMode
                  min="0"
                  placeholder="Кол-во"
                  style={{ width: 130 }}
                />
              </Form.Item>
              <Form.Item
                {...restField}
                name={[name, "unit_id"]}
                rules={[{ required: true, message: "Единица" }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  loading={unitsLoading}
                  options={unitOptions}
                  placeholder="Единица"
                  style={{ width: 160 }}
                />
              </Form.Item>
              {fields.length > 1 && (
                <MinusCircleOutlined onClick={() => remove(name)} />
              )}
            </Space>
          ))}
          <Form.Item>
            <Button
              type="dashed"
              onClick={() => add()}
              icon={<PlusOutlined />}
              block
            >
              Добавить ингредиент
            </Button>
            <Form.ErrorList errors={errors} />
          </Form.Item>
        </>
      )}
    </Form.List>
  );
}
