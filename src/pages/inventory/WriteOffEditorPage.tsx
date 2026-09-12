/** /write-offs/new и /write-offs/:id — акт списания: шапка, строки, проведение.
 *
 * Общая форма документа строки набирает вслепую. Здесь у каждой позиции видны
 * остаток склада и себестоимость, а категория списания обязательна — без неё
 * акт не сохранить. */
import {
  ArrowLeftOutlined,
  MinusCircleOutlined,
  PaperClipOutlined,
  PlusOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Result,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { listUnits } from "@/api/catalog";
import { errorCode, errorMessage, fetchAllPages } from "@/api/client";
import {
  createDocument,
  deleteDocument,
  getDocument,
  postDocument,
  updateDocument,
  type ConsumptionLineIn,
} from "@/api/inventory";
import { getStock, type StockRow } from "@/api/reports";
import { useCan } from "@/auth/store";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import { fmtMoney, fmtQty, Money } from "@/components/format";
import { useUnsavedChanges } from "@/components/useUnsavedChanges";
import {
  DocStatusTag,
  useProductsLookup,
  useWarehousesLookup,
} from "@/pages/inventory/shared";
import WriteOffCategoriesModal, {
  useWriteOffCategories,
} from "@/pages/inventory/WriteOffCategoriesModal";

interface LineValues {
  product_id?: number;
  quantity?: string;
}

interface FormValues {
  doc_date: dayjs.Dayjs;
  warehouse_id: number;
  write_off_category_id: number;
  comment?: string;
  lines: LineValues[];
}

function stockOf(map: Map<number, StockRow>, productId: number | undefined) {
  if (productId == null) return null;
  return map.get(productId) ?? null;
}

export default function WriteOffEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id == null;
  const docId = isNew ? NaN : Number(id);
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("inventory.manage");
  const [form] = Form.useForm<FormValues>();
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  const products = useProductsLookup();
  const warehouses = useWarehousesLookup();
  const categories = useWriteOffCategories();
  const units = useQuery({
    queryKey: ["lookup", "units", "all"],
    queryFn: () => fetchAllPages((pg) => listUnits(pg)),
    staleTime: 60_000,
  });
  const unitById = useMemo(
    () => new Map((units.data ?? []).map((u) => [u.unit_id, u.name])),
    [units.data],
  );

  const existing = useQuery({
    queryKey: ["document", docId],
    queryFn: () => getDocument(docId),
    enabled: Number.isFinite(docId),
  });

  const doc = existing.data;
  const isPosted = doc?.status === "posted";
  const readOnly = isPosted || !canManage;

  const warehouseId = Form.useWatch("warehouse_id", form);
  const watchedLines = Form.useWatch("lines", form) ?? [];

  const stock = useQuery({
    queryKey: ["stock", { warehouseId }],
    queryFn: () => getStock({ warehouse_id: warehouseId }),
    enabled: warehouseId != null && !isPosted,
  });
  const stockByProduct = useMemo(() => {
    const map = new Map<number, StockRow>();
    for (const row of stock.data ?? []) map.set(row.product_id, row);
    return map;
  }, [stock.data]);

  useUnsavedChanges(dirty && !readOnly, "Несохранённый акт списания потеряется.");

  const defaultCategoryId = useMemo(() => {
    const rows = categories.data ?? [];
    return (
      rows.find((c) => c.is_default && c.is_active)?.write_off_category_id ??
      rows.find((c) => c.is_active)?.write_off_category_id
    );
  }, [categories.data]);

  useEffect(() => {
    if (!isNew) return;
    if (defaultCategoryId != null && form.getFieldValue("write_off_category_id") == null) {
      form.setFieldValue("write_off_category_id", defaultCategoryId);
    }
    if (warehouses.options[0] && form.getFieldValue("warehouse_id") == null) {
      form.setFieldValue("warehouse_id", warehouses.options[0].value);
    }
  }, [defaultCategoryId, form, isNew, warehouses.options]);

  useEffect(() => {
    if (!doc || doc.type !== "write_off") return;
    form.setFieldsValue({
      doc_date: dayjs(doc.doc_date),
      warehouse_id: doc.warehouse_id,
      write_off_category_id: doc.write_off_category_id ?? undefined,
      comment: doc.comment ?? undefined,
      lines: doc.lines.map((l) => ({
        product_id: l.product_id,
        quantity: l.quantity,
      })),
    });
    setDirty(false);
  }, [doc, form]);

  const categoryOptions = (categories.data ?? [])
    .filter(
      (c) =>
        c.is_active ||
        c.write_off_category_id === doc?.write_off_category_id ||
        c.write_off_category_id === form.getFieldValue("write_off_category_id"),
    )
    .map((c) => ({ value: c.write_off_category_id, label: c.name }));

  function unitName(productId: number | undefined): string {
    if (productId == null) return "";
    const product = products.byId.get(productId);
    return product ? unitById.get(product.base_unit_id) ?? "" : "";
  }

  function lineCost(line: LineValues, index: number) {
    if (isPosted && doc?.lines[index]) {
      return {
        unit: doc.lines[index].unit_cost ?? null,
        amount: doc.lines[index].line_amount ?? null,
        stock: doc.lines[index].stock_quantity ?? null,
      };
    }
    const row = stockOf(stockByProduct, line.product_id);
    const qty = Number(line.quantity);
    const avg = row ? Number(row.avg_cost) : 0;
    return {
      unit: row?.avg_cost ?? null,
      amount: Number.isFinite(qty) && qty > 0 && avg ? String(qty * avg) : null,
      stock: row?.quantity ?? "0",
    };
  }

  const overdrawn = useMemo(() => {
    if (isPosted) return [];
    return watchedLines.flatMap((line, index) => {
      const qty = Number(line.quantity);
      const available = Number(stockOf(stockByProduct, line.product_id)?.quantity ?? 0);
      if (!line.product_id || !Number.isFinite(qty) || qty <= 0) return [];
      return qty > available ? [{ index, qty, available }] : [];
    });
  }, [watchedLines, stockByProduct, isPosted]);

  const totalAmount = useMemo(() => {
    let sum = 0;
    let any = false;
    watchedLines.forEach((line, index) => {
      const amount = lineCost(line, index).amount;
      if (amount != null) {
        sum += Number(amount);
        any = true;
      }
    });
    return any ? sum : null;
  }, [watchedLines, stockByProduct, doc, isPosted]);

  function buildPayload(values: FormValues): {
    type: "write_off";
    doc_date: string;
    warehouse_id: number;
    write_off_category_id: number;
    comment?: string;
    lines: ConsumptionLineIn[];
  } {
    const lines: ConsumptionLineIn[] = [];
    for (const line of values.lines) {
      if (line.product_id == null || line.quantity == null || line.quantity === "") {
        continue;
      }
      const product = products.byId.get(line.product_id);
      if (!product) throw new Error("Продукт строки не найден в каталоге");
      lines.push({
        product_id: line.product_id,
        quantity: String(line.quantity),
        unit_id: product.base_unit_id,
      });
    }
    if (lines.length === 0) throw new Error("Добавьте хотя бы одну строку");
    return {
      type: "write_off",
      doc_date: values.doc_date.format("YYYY-MM-DD"),
      warehouse_id: values.warehouse_id,
      write_off_category_id: values.write_off_category_id,
      comment: values.comment?.trim() || undefined,
      lines,
    };
  }

  function invalidate(id: number) {
    queryClient.invalidateQueries({ queryKey: ["document", id] });
    queryClient.invalidateQueries({ queryKey: ["documents"] });
    queryClient.invalidateQueries({ queryKey: ["write-offs"] });
    queryClient.invalidateQueries({ queryKey: ["stock"] });
  }

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const body = buildPayload(values);
      if (isNew) return createDocument(body);
      return updateDocument(docId, body);
    },
    onSuccess: (saved) => {
      message.success("Акт сохранён");
      setDirty(false);
      invalidate(saved.document_id);
      if (isNew) navigate(`/write-offs/${saved.document_id}`, { replace: true });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const post = useMutation({
    mutationFn: async (values: FormValues) => {
      const body = buildPayload(values);
      const saved = isNew
        ? await createDocument(body)
        : await updateDocument(docId, body);
      try {
        return await postDocument(saved.document_id);
      } catch (e) {
        if (isNew) {
          try {
            await deleteDocument(saved.document_id);
          } catch {
            /* черновик остался — его можно поправить */
          }
        }
        throw e;
      }
    },
    onSuccess: (saved) => {
      message.success("Акт проведён");
      setDirty(false);
      invalidate(saved.document_id);
      if (isNew) navigate(`/write-offs/${saved.document_id}`, { replace: true });
    },
    onError: (e) => {
      if (errorCode(e) === "insufficient_stock") {
        message.error(
          "На складе не хватило остатка — уменьшите количество или обновите остатки.",
        );
        return;
      }
      message.error(errorMessage(e));
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteDocument(docId),
    onSuccess: () => {
      message.success("Черновик удалён");
      queryClient.invalidateQueries({ queryKey: ["write-offs"] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      navigate("/write-offs");
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  if (!isNew && existing.isPending) {
    return (
      <div style={{ textAlign: "center", padding: 48 }}>
        <Spin />
      </div>
    );
  }
  if (!isNew && (existing.isError || !doc || doc.type !== "write_off")) {
    return (
      <Result
        status="404"
        title="Акт списания не найден"
        extra={<Button onClick={() => navigate("/write-offs")}>К актам</Button>}
      />
    );
  }

  const title = isNew
    ? "Новый акт списания"
    : `Акт списания ${doc?.number != null ? `№${doc.number}` : "черновик"}`;

  const columns: ColumnsType<LineValues & { name: number }> = [
    {
      title: "Товар",
      render: (_, _row, index) => (
        <Form.Item
          name={[index, "product_id"]}
          rules={[{ required: true, message: "Выберите товар" }]}
          style={{ marginBottom: 0 }}
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={products.options}
            placeholder="Товар"
            disabled={readOnly}
            style={{ minWidth: 220 }}
          />
        </Form.Item>
      ),
    },
    {
      title: "Ед.",
      width: 70,
      render: (_, row) => unitName(row.product_id) || "—",
    },
    {
      title: "Количество",
      width: 140,
      render: (_, row, index) => {
        const available = Number(lineCost(row, index).stock ?? 0);
        const qty = Number(row.quantity);
        const over = Number.isFinite(qty) && qty > available && !isPosted;
        return (
          <Form.Item
            name={[index, "quantity"]}
            rules={[
              { required: true, message: "Кол-во" },
              {
                validator: async (_, val) => {
                  if (val == null || val === "") return;
                  if (Number(val) <= 0) throw new Error("Количество > 0");
                },
              },
            ]}
            style={{ marginBottom: 0 }}
          >
            <InputNumber
              stringMode
              min="0"
              disabled={readOnly}
              status={over ? "error" : undefined}
              style={{ width: "100%" }}
            />
          </Form.Item>
        );
      },
    },
    {
      title: "Себест. ед.",
      width: 120,
      align: "right",
      render: (_, row, index) => fmtMoney(lineCost(row, index).unit),
    },
    {
      title: "Сумма",
      width: 130,
      align: "right",
      render: (_, row, index) => fmtMoney(lineCost(row, index).amount),
    },
    {
      title: "Остаток",
      width: 120,
      align: "right",
      render: (_, row, index) => {
        const qty = lineCost(row, index).stock;
        return `${fmtQty(qty)} ${unitName(row.product_id)}`.trim();
      },
    },
    ...(!readOnly
      ? [
          {
            title: "",
            width: 40,
            render: (_: unknown, __: unknown, index: number) => (
              <MinusCircleOutlined
                style={{ color: "#ff4d4f" }}
                onClick={() => {
                  const lines = [...(form.getFieldValue("lines") ?? [])];
                  lines.splice(index, 1);
                  form.setFieldValue("lines", lines.length ? lines : [{}]);
                  setDirty(true);
                }}
              />
            ),
          } as ColumnsType<LineValues & { name: number }>[number],
        ]
      : []),
  ];

  return (
    <div>
      <Space
        style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}
      >
        <Space>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate("/write-offs")}
          />
          <h2 style={{ margin: 0 }}>{title}</h2>
          {doc && <DocStatusTag status={doc.status} />}
        </Space>
        {!isPosted && canManage && (
          <Space>
            <Button
              loading={save.isPending}
              onClick={() => form.submit()}
            >
              Сохранить
            </Button>
            <Popconfirm
              title="Провести акт списания?"
              description="Товар уйдёт со склада, документ нельзя будет изменить."
              okText="Провести"
              cancelText="Отмена"
              disabled={overdrawn.length > 0}
              onConfirm={() => form.validateFields().then((v) => post.mutate(v))}
            >
              <Button
                type="primary"
                loading={post.isPending}
                disabled={overdrawn.length > 0}
              >
                Провести
              </Button>
            </Popconfirm>
            {Number.isFinite(docId) && (
              <Popconfirm
                title="Удалить черновик?"
                okText="Удалить"
                okButtonProps={{ danger: true }}
                cancelText="Отмена"
                onConfirm={() => remove.mutate()}
              >
                <Button danger loading={remove.isPending}>
                  Удалить
                </Button>
              </Popconfirm>
            )}
          </Space>
        )}
      </Space>

      {!canManage && !isPosted && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Только просмотр"
          description="Списывать товар может тот, кто ведёт склад — нужно право inventory.manage."
        />
      )}

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          doc_date: dayjs(),
          lines: [{}],
        }}
        onValuesChange={() => setDirty(true)}
        onFinish={(v) => save.mutate(v)}
      >
        <Row gutter={12}>
          <Col xs={24} md={6}>
            <Form.Item
              name="doc_date"
              label="Дата"
              rules={[{ required: true, message: "Укажите дату" }]}
            >
              <DatePicker
                style={{ width: "100%" }}
                format="DD.MM.YYYY"
                disabled={readOnly}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <Form.Item
              name="warehouse_id"
              label="Склад"
              rules={[{ required: true, message: "Выберите склад" }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                options={warehouses.options}
                placeholder="Склад"
                disabled={readOnly}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              name="write_off_category_id"
              label="Категория списания"
              rules={[{ required: true, message: "Выберите категорию" }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                options={categoryOptions}
                placeholder="Категория"
                disabled={readOnly}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={4} style={{ display: "flex", alignItems: "flex-end" }}>
            <Form.Item>
              <Button
                icon={<SettingOutlined />}
                onClick={() => setCategoriesOpen(true)}
              >
                Категории
              </Button>
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="comment" label="Комментарий">
          <Input.TextArea
            rows={2}
            maxLength={2000}
            placeholder="Необязательно"
            disabled={readOnly}
          />
        </Form.Item>

        {overdrawn.length > 0 && (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
            message={`Больше, чем лежит: ${overdrawn.length} поз.`}
            description="Сервер откажет по всему документу — уменьшите количество."
          />
        )}

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
          {(fields, { add }, { errors }) => (
            <>
              <Table<LineValues & { name: number }>
                rowKey={(row) => String(row.name)}
                size="small"
                pagination={false}
                dataSource={fields.map((field) => ({
                  ...field,
                  ...(watchedLines[field.name] ?? {}),
                }))}
                columns={columns}
              />
              {!readOnly && (
                <Button
                  type="dashed"
                  onClick={() => add({})}
                  icon={<PlusOutlined />}
                  block
                  style={{ marginTop: 12 }}
                >
                  Добавить строку
                </Button>
              )}
              <Form.ErrorList errors={errors} />
            </>
          )}
        </Form.List>
      </Form>

      <Row justify="end" style={{ marginTop: 16 }}>
        <Col>
          <Typography.Text>
            Итого:{" "}
            <b>
              {totalAmount == null ? "—" : <Money value={totalAmount} />}
            </b>
          </Typography.Text>
        </Col>
      </Row>

      {Number.isFinite(docId) && (
        <Card
          size="small"
          title={
            <Space>
              <PaperClipOutlined />
              Фото акта
            </Space>
          }
          style={{ marginTop: 16 }}
        >
          <AttachmentsPanel
            owner={{ kind: "invoice", documentId: docId }}
            canManage={canManage}
            emptyText="Фото акта не приложены"
            uploadHint="Фото бумажного акта или его pdf"
          />
        </Card>
      )}

      <WriteOffCategoriesModal
        open={categoriesOpen}
        onClose={() => setCategoriesOpen(false)}
      />
    </div>
  );
}
