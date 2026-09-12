import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  createRecipe,
  deleteRecipe,
  listRecipes,
  type RecipeOut,
} from "@/api/recipes";
import { useCan } from "@/auth/store";
import { fmtDate, fmtQty } from "@/components/format";
import { useListControls } from "@/components/useListControls";
import { usePagination } from "@/components/usePagination";
import { foodIngredientNutritionMissing } from "@/pages/catalog/recipeMath";
import RecipeItemsField from "@/pages/catalog/RecipeItemsField";
import {
  useProductOptions,
  useUnitOptions,
} from "@/pages/catalog/useCatalogOptions";

interface RecipeItemForm {
  component_product_id: number;
  quantity: string;
  unit_id: number;
}

interface RecipeCreateForm {
  product_id: number;
  output_quantity: string;
  output_unit_id: number;
  items: RecipeItemForm[];
}

export default function RecipesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const canManage = useCan("recipe.manage");
  const { limit, offset, tablePagination, reset } = usePagination();
  // Колонка показывает product_id, а API сортирует по `product` (имени изделия).
  const { search, setSearch, searchParam, sort, onTableChange } =
    useListControls<RecipeOut>({ onReset: reset, fieldMap: { product_id: "product" } });
  const products = useProductOptions();
  const units = useUnitOptions();

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<RecipeCreateForm>();

  const query = useQuery({
    queryKey: ["recipes", { limit, offset, searchParam, sort }],
    queryFn: () => listRecipes({ limit, offset, search: searchParam, sort, active: true }),
  });

  const create = useMutation({
    mutationFn: (values: RecipeCreateForm) => {
      const missing = [
        ...new Set(
          values.items
            .map((i) => products.productOf(i.component_product_id))
            .filter((p) => foodIngredientNutritionMissing(p))
            .map((p) => p!.name),
        ),
      ];
      if (missing.length) {
        return Promise.reject(
          new Error(`У сырья не заполнено КБЖУ: ${missing.join(", ")}`),
        );
      }
      return createRecipe({
        product_id: values.product_id,
        output_quantity: values.output_quantity,
        output_unit_id: values.output_unit_id,
        items: values.items.map((i) => ({
          component_product_id: i.component_product_id,
          quantity: i.quantity,
          unit_id: i.unit_id,
        })),
      });
    },
    onSuccess: (recipe) => {
      message.success("Тех-карта создана");
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      navigate(`/recipes/${recipe.recipe_id}`);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteRecipe(id),
    onSuccess: () => {
      message.success("Тех-карта удалена");
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openCreate() {
    form.resetFields();
    form.setFieldsValue({ items: [{} as RecipeItemForm] });
    setModalOpen(true);
  }

  const columns: ColumnsType<RecipeOut> = [
    {
      title: "Продукт",
      dataIndex: "product_id",
      sorter: true,
      render: (id: number) => products.nameOf(id),
    },
    {
      title: "Выход",
      key: "output_quantity",
      dataIndex: "output_quantity",
      width: 200,
      sorter: true,
      render: (_, row) =>
        `${fmtQty(row.output_quantity)} ${units.nameOf(row.output_unit_id)}`,
    },
    {
      title: "Ингредиентов",
      key: "items",
      width: 130,
      render: (_, row) => row.items.length,
    },
    {
      title: "Действует с",
      dataIndex: "effective_from",
      width: 130,
      render: (v: string) => fmtDate(v),
    },
    {
      title: "Статус",
      dataIndex: "is_active",
      width: 110,
      render: (active: boolean) =>
        active ? <Tag color="green">Действует</Tag> : <Tag>Архив</Tag>,
    },
    {
      title: "",
      width: 90,
      render: (_, row) =>
        canManage ? (
          <Popconfirm
            title="Удалить тех-карту?"
            okText="Да"
            cancelText="Нет"
            onConfirm={() => remove.mutate(row.recipe_id)}
          >
            <a onClick={(e) => e.stopPropagation()}>Удалить</a>
          </Popconfirm>
        ) : null,
    },
  ];

  return (
    <div>
      <Space
        style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}
      >
        <Space wrap>
          <h2 style={{ margin: 0 }}>Тех-карты</h2>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Поиск по названию изделия"
            style={{ width: 260 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Space>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Новая тех-карта
          </Button>
        )}
      </Space>

      <Table<RecipeOut>
        rowKey="recipe_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        pagination={tablePagination(query.data?.total)}
        columns={columns}
        onChange={onTableChange}
        rowClassName={() => "row-clickable"}
        onRow={(row) => ({
          onClick: () => navigate(`/recipes/${row.recipe_id}`),
        })}
      />

      <Modal
        title="Новая тех-карта"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Создать"
        cancelText="Отмена"
        confirmLoading={create.isPending}
        width={720}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => create.mutate(v)}>
          <Form.Item
            name="product_id"
            label="Продукт (что готовим)"
            rules={[{ required: true, message: "Выберите продукт" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              loading={products.isLoading}
              options={products.options}
              placeholder="Продукт"
            />
          </Form.Item>
          <Space align="baseline" style={{ display: "flex" }}>
            <Form.Item
              name="output_quantity"
              label="Выход"
              rules={[
                { required: true, message: "Укажите выход" },
                {
                  validator: (_, value: string) =>
                    value != null && Number(value) > 0
                      ? Promise.resolve()
                      : Promise.reject(new Error("> 0")),
                },
              ]}
            >
              <InputNumber stringMode min="0" style={{ width: 160 }} />
            </Form.Item>
            <Form.Item
              name="output_unit_id"
              label="Единица выхода"
              rules={[{ required: true, message: "Единица" }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                loading={units.isLoading}
                options={units.options}
                placeholder="Единица"
                style={{ width: 200 }}
              />
            </Form.Item>
          </Space>

          <div style={{ marginBottom: 8, fontWeight: 500 }}>Ингредиенты</div>
          <RecipeItemsField
            productOptions={products.options}
            productsLoading={products.isLoading}
            unitOptions={units.options}
            unitsLoading={units.isLoading}
          />
        </Form>
      </Modal>
    </div>
  );
}
