/** Shared document form fields + payload builder for the "create" modal
 *  (/documents) and the draft "edit" modal (/documents/:id). The line schema is
 *  type-dependent (receipt carries price/free_goods, inventory_count carries
 *  expected_quantity/price, the rest are bare consumption lines), so fields are
 *  rendered conditionally on the watched `type`. unit_id is derived from each
 *  product's base_unit_id (the UI works in base units). */
import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import {
  Button,
  Col,
  DatePicker,
  Divider,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Switch,
} from "antd";
import type { FormInstance } from "antd";
import type { Dayjs } from "dayjs";

import type {
  ConsumptionLineIn,
  DocumentCreate,
  DocumentType,
  InventoryCountLineIn,
  ProductOut,
  ReceiptLineIn,
} from "@/api/inventory";
import { DOC_TYPE_OPTIONS } from "@/pages/inventory/shared";

export interface DocumentFormValues {
  type: DocumentType;
  doc_date: Dayjs;
  warehouse_id: number;
  target_warehouse_id?: number;
  counterparty?: string;
  internal?: boolean;
  supplier_id?: number;
  /** От чьего НАШЕГО юр. лица документ. Пусто — бэкенд подставит то, что по
   *  умолчанию: у приходной накладной от этого зависит, в чью кредиторку уйдёт долг. */
  company_entity_id?: number;
  lines: {
    product_id: number;
    quantity: string;
    price?: string;
    expected_quantity?: string;
    free_goods?: boolean;
  }[];
}

interface Option {
  value: number;
  label: string;
}

/** Build the discriminated-union payload the backend expects. Throws if a line
 *  references a product missing from the loaded catalog (can't derive unit). */
export function buildDocumentPayload(
  values: DocumentFormValues,
  productsById: Map<number, ProductOut>,
): DocumentCreate {
  const doc_date = values.doc_date.format("YYYY-MM-DD");
  const warehouse_id = values.warehouse_id;
  const counterparty = values.counterparty?.trim() || undefined;
  const company_entity_id = values.company_entity_id;

  const unitOf = (productId: number): number => {
    const p = productsById.get(productId);
    if (!p) throw new Error("Продукт строки не найден в каталоге");
    return p.base_unit_id;
  };

  if (values.type === "receipt") {
    const internal = !!values.internal;
    const lines: ReceiptLineIn[] = values.lines.map((l) => {
      const free = !!l.free_goods;
      return {
        product_id: l.product_id,
        quantity: String(l.quantity),
        unit_id: unitOf(l.product_id),
        free_goods: free,
        price: free ? "0" : l.price != null ? String(l.price) : null,
      };
    });
    return {
      type: "receipt",
      doc_date,
      warehouse_id,
      counterparty,
      company_entity_id,
      internal,
      supplier_id: internal ? undefined : values.supplier_id,
      lines,
    };
  }

  if (values.type === "inventory_count") {
    const lines: InventoryCountLineIn[] = values.lines.map((l) => ({
      product_id: l.product_id,
      quantity: String(l.quantity),
      unit_id: unitOf(l.product_id),
      expected_quantity:
        l.expected_quantity != null && l.expected_quantity !== ""
          ? String(l.expected_quantity)
          : undefined,
      price: l.price != null && l.price !== "" ? String(l.price) : undefined,
    }));
    return {
      type: "inventory_count",
      doc_date,
      warehouse_id,
      counterparty,
      company_entity_id,
      lines,
    };
  }

  const lines: ConsumptionLineIn[] = values.lines.map((l) => ({
    product_id: l.product_id,
    quantity: String(l.quantity),
    unit_id: unitOf(l.product_id),
  }));

  if (values.type === "transfer") {
    return {
      type: "transfer",
      doc_date,
      warehouse_id,
      counterparty,
      company_entity_id,
      target_warehouse_id: values.target_warehouse_id as number,
      lines,
    };
  }
  // write_off | production | sale — identical bare-consumption shape.
  switch (values.type) {
    case "write_off":
      return { type: "write_off", doc_date, warehouse_id, counterparty,
               company_entity_id, lines };
    case "production":
      return { type: "production", doc_date, warehouse_id, counterparty,
               company_entity_id, lines };
    case "sale":
      return { type: "sale", doc_date, warehouse_id, counterparty,
               company_entity_id, lines };
    default:
      throw new Error(`Неизвестный тип документа: ${values.type}`);
  }
}

interface FieldsProps {
  form: FormInstance<DocumentFormValues>;
  mode: "create" | "edit";
  productOptions: Option[];
  warehouseOptions: Option[];
  supplierOptions: Option[];
  /** Наши юр. лица. Пустой список — справочник не заведён, и поле просто пустое:
   *  бэкенд в этом случае оставит документ без юрлица, и это видно в отчётах. */
  companyEntityOptions?: Option[];
}

export function DocumentFormFields({
  form,
  mode,
  productOptions,
  warehouseOptions,
  supplierOptions,
  companyEntityOptions = [],
}: FieldsProps) {
  const type = Form.useWatch("type", form);
  const internal = Form.useWatch("internal", form);
  const warehouseId = Form.useWatch("warehouse_id", form);

  const isReceipt = type === "receipt";
  const isTransfer = type === "transfer";
  const isCount = type === "inventory_count";

  function qtyRules() {
    return [
      { required: true, message: "Укажите количество" },
      {
        validator: async (_: unknown, val: string) => {
          if (val == null || val === "") return;
          const n = Number(val);
          if (Number.isNaN(n)) throw new Error("Некорректное число");
          if (isCount) {
            if (n < 0) throw new Error("Количество ≥ 0");
          } else if (n <= 0) {
            throw new Error("Количество > 0");
          }
        },
      },
    ];
  }

  return (
    <>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item
            name="type"
            label="Тип документа"
            rules={[{ required: true, message: "Выберите тип" }]}
          >
            <Select
              options={DOC_TYPE_OPTIONS}
              disabled={mode === "edit"}
              placeholder="Тип"
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="doc_date"
            label="Дата"
            rules={[{ required: true, message: "Укажите дату" }]}
          >
            <DatePicker style={{ width: "100%" }} format="DD.MM.YYYY" />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={12}>
        <Col span={12}>
          <Form.Item
            name="warehouse_id"
            label={isTransfer ? "Склад-источник" : "Склад"}
            rules={[{ required: true, message: "Выберите склад" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={warehouseOptions}
              placeholder="Склад"
            />
          </Form.Item>
        </Col>
        {isTransfer && (
          <Col span={12}>
            <Form.Item
              name="target_warehouse_id"
              label="Склад-получатель"
              rules={[
                { required: true, message: "Выберите склад-получатель" },
                {
                  validator: async (_, val) => {
                    if (val != null && val === warehouseId) {
                      throw new Error("Склады должны отличаться");
                    }
                  },
                },
              ]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                options={warehouseOptions}
                placeholder="Куда"
              />
            </Form.Item>
          </Col>
        )}
      </Row>

      {isReceipt && (
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item
              name="internal"
              label="Внутренний приход (без поставщика)"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </Col>
          {!internal && (
            <Col span={12}>
              <Form.Item
                name="supplier_id"
                label="Поставщик"
                rules={[{ required: true, message: "Выберите поставщика" }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  options={supplierOptions}
                  placeholder="Поставщик"
                />
              </Form.Item>
            </Col>
          )}
        </Row>
      )}

      {/* Наше юр. лицо: от кого документ. Для приходной накладной это и решает,
          в чью кредиторку попадёт долг перед поставщиком. Пусто — бэкенд
          подставит компанию «по умолчанию», чтобы разрез был у каждой накладной,
          а не только у тех, где выбор не забыли. */}
      <Form.Item
        name="company_entity_id"
        label="Наше юр. лицо"
        tooltip="От чьего имени документ. Пусто — компания по умолчанию"
      >
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="По умолчанию"
          options={companyEntityOptions}
        />
      </Form.Item>
      <Form.Item name="counterparty" label="Контрагент / комментарий">
        <Input maxLength={256} placeholder="Необязательно" />
      </Form.Item>

      <Divider style={{ margin: "8px 0" }}>Строки</Divider>

      <Form.List
        name="lines"
        rules={[
          {
            validator: async (_, lines) => {
              if (!lines || lines.length < 1) {
                throw new Error("Добавьте хотя бы одну строку");
              }
            },
          },
        ]}
      >
        {(fields, { add, remove }, { errors }) => (
          <>
            {fields.map(({ key, name, ...restField }) => (
              <div
                key={key}
                style={{
                  border: "1px solid #f0f0f0",
                  borderRadius: 6,
                  padding: "8px 12px 0",
                  marginBottom: 8,
                }}
              >
                <Row gutter={12} align="top">
                  <Col flex="auto">
                    <Form.Item
                      {...restField}
                      name={[name, "product_id"]}
                      label="Продукт"
                      rules={[{ required: true, message: "Выберите продукт" }]}
                    >
                      <Select
                        showSearch
                        optionFilterProp="label"
                        options={productOptions}
                        placeholder="Продукт"
                      />
                    </Form.Item>
                  </Col>
                  <Col flex="0 0 24px" style={{ paddingTop: 34 }}>
                    <MinusCircleOutlined
                      style={{ color: "#ff4d4f" }}
                      onClick={() => remove(name)}
                    />
                  </Col>
                </Row>

                <Row gutter={12}>
                  <Col span={8}>
                    <Form.Item
                      {...restField}
                      name={[name, "quantity"]}
                      label={isCount ? "Факт. кол-во" : "Количество"}
                      rules={qtyRules()}
                    >
                      <InputNumber
                        stringMode
                        min="0"
                        style={{ width: "100%" }}
                      />
                    </Form.Item>
                  </Col>

                  {isCount && (
                    <Col span={8}>
                      <Form.Item
                        {...restField}
                        name={[name, "expected_quantity"]}
                        label="Ожид. кол-во"
                        tooltip="Опционально: проверка против расчётного остатка"
                      >
                        <InputNumber
                          stringMode
                          min="0"
                          style={{ width: "100%" }}
                        />
                      </Form.Item>
                    </Col>
                  )}

                  {isReceipt && (
                    <>
                      <Col span={8}>
                        <Form.Item
                          noStyle
                          shouldUpdate={(prev, cur) =>
                            prev.lines?.[name]?.free_goods !==
                            cur.lines?.[name]?.free_goods
                          }
                        >
                          {() => {
                            const free = form.getFieldValue([
                              "lines",
                              name,
                              "free_goods",
                            ]);
                            return (
                              <Form.Item
                                {...restField}
                                name={[name, "price"]}
                                label="Цена (за ед.)"
                                rules={
                                  free
                                    ? []
                                    : [
                                        {
                                          required: true,
                                          message: "Цена > 0",
                                        },
                                      ]
                                }
                              >
                                <InputNumber
                                  stringMode
                                  min="0"
                                  disabled={free}
                                  style={{ width: "100%" }}
                                />
                              </Form.Item>
                            );
                          }}
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item
                          {...restField}
                          name={[name, "free_goods"]}
                          label="Бонус (0 ₽)"
                          valuePropName="checked"
                        >
                          <Switch
                            onChange={(checked) => {
                              if (checked) {
                                form.setFieldValue(
                                  ["lines", name, "price"],
                                  "0",
                                );
                              }
                            }}
                          />
                        </Form.Item>
                      </Col>
                    </>
                  )}

                  {isCount && (
                    <Col span={8}>
                      <Form.Item
                        {...restField}
                        name={[name, "price"]}
                        label="Цена излишка"
                        tooltip="Обязательна, если текущий остаток/себестоимость равны нулю"
                      >
                        <InputNumber
                          stringMode
                          min="0"
                          style={{ width: "100%" }}
                        />
                      </Form.Item>
                    </Col>
                  )}
                </Row>
              </div>
            ))}

            <Button
              type="dashed"
              onClick={() => add({})}
              icon={<PlusOutlined />}
              block
            >
              Добавить строку
            </Button>
            <Form.ErrorList errors={errors} />
          </>
        )}
      </Form.List>
    </>
  );
}
