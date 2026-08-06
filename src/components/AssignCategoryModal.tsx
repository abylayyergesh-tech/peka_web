/** Перенести выбранные товары в категорию — пачкой.
 *
 *  Пачкой, а не по одному, потому что из iiko приехало около девятисот позиций
 *  без категории: поштучная правка карточек — не работа для человека. Отсюда же
 *  возможность завести категорию прямо здесь: раскладывая товары, понимаешь,
 *  какая категория нужна, ровно в этот момент.
 *
 *  Отдельный пункт «— без категории —» нужен, чтобы снять неверно проставленную
 *  категорию: пустой выбор в списке значит «ничего не выбрано», а снятие — это
 *  осознанное действие, и в API оно отдельным значением (null). */
import { App, Alert, Form, Input, Modal, Select, Space } from "antd";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import { assignProductsCategory, createProductCategory } from "@/api/catalog";

import { PRODUCT_CATEGORIES_KEY, useProductCategories } from "./ProductCategoriesModal";

/** Значение пункта «снять категорию». -1, а не null: null в antd Select — это
 *  «ничего не выбрано», и отличить одно от другого иначе нельзя. */
const CLEAR = -1;

export default function AssignCategoryModal({
  open,
  productIds,
  onClose,
  onDone,
}: {
  open: boolean;
  productIds: number[];
  onClose: () => void;
  /** Вызывается после успешного переноса — родителю обычно надо снять выделение. */
  onDone?: () => void;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const categories = useProductCategories();
  const [target, setTarget] = useState<number | undefined>();
  const [newName, setNewName] = useState("");

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: PRODUCT_CATEGORIES_KEY });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["lookup", "products"] });
    queryClient.invalidateQueries({ queryKey: ["abc"] });
    queryClient.invalidateQueries({ queryKey: ["sales-by-product"] });
  }

  const assign = useMutation({
    mutationFn: async () => {
      // Новая категория заводится тем же действием: иначе человеку пришлось бы
      // закрыть окно, сходить в справочник и заново выбрать те же товары.
      let categoryId: number | null;
      const name = newName.trim();
      if (name) {
        categoryId = (await createProductCategory({ name })).product_category_id;
      } else if (target === CLEAR) {
        categoryId = null;
      } else if (target != null) {
        categoryId = target;
      } else {
        throw new Error("Выберите категорию или введите название новой");
      }
      return assignProductsCategory({
        product_ids: productIds,
        product_category_id: categoryId,
      });
    },
    onSuccess: (res) => {
      message.success(
        res.category
          ? `Перенесено товаров: ${res.updated} → «${res.category}»`
          : `Категория снята у ${res.updated} товаров`,
      );
      setTarget(undefined);
      setNewName("");
      invalidateAll();
      onDone?.();
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <Modal
      title={`Перенести в категорию: ${productIds.length} товаров`}
      open={open}
      onCancel={onClose}
      onOk={() => assign.mutate()}
      okText="Перенести"
      cancelText="Отмена"
      confirmLoading={assign.isPending}
      okButtonProps={{ disabled: !newName.trim() && target == null }}
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Form layout="vertical" component="div">
          <Form.Item label="Категория" style={{ marginBottom: 12 }}>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Выберите из справочника"
              value={target}
              loading={categories.isPending}
              disabled={!!newName.trim()}
              onChange={(v) => setTarget(v)}
              options={[
                { value: CLEAR, label: "— без категории —" },
                ...(categories.data ?? []).map((c) => ({
                  value: c.product_category_id,
                  label: `${c.name} (${c.product_count})`,
                })),
              ]}
            />
          </Form.Item>
          <Form.Item
            label="…или новая категория"
            extra="Заполните, если нужной категории ещё нет — она будет создана"
            style={{ marginBottom: 0 }}
          >
            <Input
              maxLength={256}
              placeholder="Название новой категории"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </Form.Item>
        </Form>
        {target === CLEAR && !newName.trim() && (
          <Alert
            type="warning"
            showIcon
            message="У выбранных товаров категория будет снята — в отчётах они уйдут в «Без категории»."
          />
        )}
      </Space>
    </Modal>
  );
}
