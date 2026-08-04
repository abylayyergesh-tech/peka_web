/** Показ КБЖУ — общий для товара и для позиции меню.
 *
 * Заполненное в карточке значение (в том числе выгруженное из внешнего меню
 * iiko) показывается как есть, остальное считается по тех-карте — тег внизу
 * говорит, что именно перед вами. Здесь ничего не редактируется: только показ и
 * честное предупреждение, когда часть компонентов без данных — занижённые цифры
 * на этикетке хуже их отсутствия.
 */
import { Alert, Descriptions, Modal, Spin, Tag } from "antd";
import { useQuery } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  getProductNutrition,
  type NutrientsOut,
  type NutritionOut,
} from "@/api/catalog";
import { getMenuItemNutrition, type MenuItemNutritionOut } from "@/api/sales";

/** Ответ у товара и у позиции меню отличается одной строкой значений, поэтому
 *  показ у них общий, а тип — объединение. */
type NutritionData = NutritionOut | MenuItemNutritionOut;

/** «на 100 г» / «на порцию» — две колонки одной таблицы. */
function Values({ label, value }: { label: string; value: NutrientsOut | null }) {
  return (
    <Descriptions
      size="small"
      column={4}
      title={label}
      styles={{ label: { color: "#8c8c8c" } }}
    >
      <Descriptions.Item label="Ккал">
        {value ? <b>{value.energy_kcal}</b> : "—"}
      </Descriptions.Item>
      <Descriptions.Item label="Белки">{value ? `${value.protein} г` : "—"}</Descriptions.Item>
      <Descriptions.Item label="Жиры">{value ? `${value.fat} г` : "—"}</Descriptions.Item>
      <Descriptions.Item label="Углеводы">{value ? `${value.carbs} г` : "—"}</Descriptions.Item>
    </Descriptions>
  );
}

interface Props {
  /** Что показываем: товар (на 100 г и на базовую единицу) или позицию меню. */
  target: { kind: "product"; id: number } | { kind: "menu-item"; id: number } | null;
  title: string;
  /** Название базовой единицы товара — подпись ко второй строке значений. */
  unitName?: string;
  onClose: () => void;
}

export default function NutritionModal({ target, title, unitName, onClose }: Props) {
  const query = useQuery<NutritionData>({
    queryKey: ["nutrition", target?.kind, target?.id],
    queryFn: () =>
      target!.kind === "product"
        ? getProductNutrition(target!.id)
        : getMenuItemNutrition(target!.id),
    enabled: target != null,
  });

  const data = query.data;
  const perPortion = data
    ? "per_portion" in data
      ? data.per_portion
      : data.per_unit
    : null;
  const portionLabel =
    target?.kind === "menu-item"
      ? "На порцию"
      : `На 1 ${unitName ?? "ед."}`;
  const weight =
    data && "portion_weight_kg" in data ? data.portion_weight_kg : data?.unit_weight_kg;

  return (
    <Modal
      open={target != null}
      onCancel={onClose}
      footer={null}
      width={620}
      title={`Пищевая ценность — ${title}`}
    >
      {query.isPending && <Spin />}
      {query.isError && <Alert type="error" showIcon message={errorMessage(query.error)} />}
      {data && (
        <>
          {!data.complete && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message="Данные неполные — значения занижены"
              description={
                data.missing_product_names.length > 0
                  ? `Не заполнено КБЖУ или вес единицы: ${data.missing_product_names.join(", ")}`
                  : "У части компонентов не заполнено КБЖУ."
              }
            />
          )}
          <Values label="На 100 г" value={data.per_100g} />
          <Values label={portionLabel} value={perPortion} />
          <div style={{ marginTop: 12 }}>
            {weight ? (
              <Tag>
                {target?.kind === "menu-item" ? "Вес порции" : "Вес единицы"}:{" "}
                {(Number(weight) * 1000).toFixed(0)} г
              </Tag>
            ) : (
              <Tag color="orange">Вес не задан — «на 100 г» посчитать нечем</Tag>
            )}
            {data.source === "own" ? (
              <Tag color="blue">указано в карточке</Tag>
            ) : (
              data.complete && <Tag color="green">по тех-карте</Tag>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
