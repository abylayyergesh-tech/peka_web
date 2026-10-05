import { Card, Modal, Radio, Space } from "antd";

import Stat from "@/components/Stat";
import { useNumberDisplay, type NumberMode } from "@/components/numberDisplay";

/** Пример для предпросмотра — сумма, которая в узкой плашке не помещалась. */
const SAMPLE = "123456789.5";

/** Настройка «Отображение чисел» из меню профиля. Действует на плашки итогов
 *  (выручка, стоимость запасов, суммы ведомости); таблицы всегда показывают
 *  точные суммы — там сокращение спрятало бы копейки в сверке. */
export default function NumberDisplaySettings({ open, onClose }: {
  open: boolean;
  onClose: () => void;
}) {
  const mode = useNumberDisplay((s) => s.mode);
  const setMode = useNumberDisplay((s) => s.setMode);

  return (
    <Modal
      title="Отображение чисел"
      open={open}
      onCancel={onClose}
      onOk={onClose}
      okText="Готово"
      cancelButtonProps={{ style: { display: "none" } }}
    >
      <p className="tour-picker-lead">
        Крупные суммы в плашках итогов никогда не налезают на соседние: шрифт
        уменьшается, а если места совсем мало — число переносится по разрядам.
        Выберите, как показывать суммы от миллиона:
      </p>
      <Radio.Group
        value={mode}
        onChange={(e) => setMode(e.target.value as NumberMode)}
        style={{ width: "100%" }}
      >
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          <Radio value="full">
            <strong>Полностью</strong>
            <div className="row-card-meta">123 456 789,50 — каждая копейка видна</div>
          </Radio>
          <Radio value="compact">
            <strong>Сокращённо</strong>
            <div className="row-card-meta">
              123,46 млн — точная сумма во всплывающей подсказке
            </div>
          </Radio>
        </Space>
      </Radio.Group>
      <p className="dossier-block-title" style={{ marginTop: 20 }}>Как будет выглядеть</p>
      {/* Узкие карточки нарочно: так плашка выглядит на ноутбуке в ряду из четырёх. */}
      <Space size={12} wrap>
        <Card size="small" style={{ width: 170 }}>
          <Stat title="Выручка" value={SAMPLE} format="money" />
        </Card>
        <Card size="small" style={{ width: 170 }}>
          <Stat title="Чеков" value={1234} format="count" />
        </Card>
      </Space>
      <p className="dossier-note">
        Таблицы и документы всегда показывают точные суммы; в узкой колонке
        длинное число переносится по разрядам.
      </p>
    </Modal>
  );
}
