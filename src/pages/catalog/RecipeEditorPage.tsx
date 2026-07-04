import { ArrowLeftOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  Form,
  InputNumber,
  Result,
  Select,
  Space,
  Spin,
  Switch,
} from "antd";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import { getRecipe, updateRecipe } from "@/api/recipes";
import { useCan } from "@/auth/store";
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

interface RecipeEditForm {
  output_quantity: string;
  output_unit_id: number;
  is_active: boolean;
  items: RecipeItemForm[];
}

export default function RecipeEditorPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const params = useParams();
  const recipeId = Number(params.id);
  const validId = Number.isFinite(recipeId);

  const canManage = useCan("recipe.manage");
  const products = useProductOptions();
  const units = useUnitOptions();
  const [form] = Form.useForm<RecipeEditForm>();

  const query = useQuery({
    queryKey: ["recipe", recipeId],
    queryFn: () => getRecipe(recipeId),
    enabled: validId,
  });

  const recipe = query.data;

  useEffect(() => {
    if (recipe) {
      form.setFieldsValue({
        output_quantity: recipe.output_quantity,
        output_unit_id: recipe.output_unit_id,
        is_active: recipe.is_active,
        items: recipe.items.map((i) => ({
          component_product_id: i.component_product_id,
          quantity: i.quantity,
          unit_id: i.unit_id,
        })),
      });
    }
  }, [recipe, form]);

  const save = useMutation({
    mutationFn: (values: RecipeEditForm) =>
      updateRecipe(recipeId, {
        output_quantity: values.output_quantity,
        output_unit_id: values.output_unit_id,
        is_active: values.is_active,
        items: values.items.map((i) => ({
          component_product_id: i.component_product_id,
          quantity: i.quantity,
          unit_id: i.unit_id,
        })),
      }),
    onSuccess: () => {
      message.success("Сохранено");
      queryClient.invalidateQueries({ queryKey: ["recipe", recipeId] });
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  if (!validId) {
    return <Result status="404" title="Тех-карта не найдена" />;
  }
  if (query.isPending) {
    return <Spin style={{ display: "block", marginTop: 48 }} />;
  }
  if (query.isError || !recipe) {
    return (
      <Result
        status="error"
        title="Не удалось загрузить тех-карту"
        subTitle={errorMessage(query.error)}
        extra={
          <Button onClick={() => navigate("/recipes")}>К списку тех-карт</Button>
        }
      />
    );
  }

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate("/recipes")}
        >
          Назад
        </Button>
        <h2 style={{ margin: 0 }}>
          Тех-карта: {products.nameOf(recipe.product_id)}
        </h2>
      </Space>

      <Card>
        <Form
          form={form}
          layout="vertical"
          disabled={!canManage}
          onFinish={(v) => save.mutate(v)}
        >
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
            <Form.Item name="is_active" label="Активна" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>

          <div style={{ marginBottom: 8, fontWeight: 500 }}>Ингредиенты</div>
          <RecipeItemsField
            productOptions={products.options}
            productsLoading={products.isLoading}
            unitOptions={units.options}
            unitsLoading={units.isLoading}
          />

          {canManage && (
            <Form.Item style={{ marginTop: 16 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={save.isPending}
              >
                Сохранить
              </Button>
            </Form.Item>
          )}
        </Form>
      </Card>
    </div>
  );
}
