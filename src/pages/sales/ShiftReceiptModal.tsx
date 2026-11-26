/** Чек за смену: тот же документ, что в кассе («Общий чек за смену»), в двух
 * подробностях. «Итоги смены» — Z-отчёт, который сдаёт кассир; «Полный чек» —
 * плюс все проданные за смену позиции одной сводкой (её просят пекарня и
 * бухгалтер). Текст готовит бэкенд, здесь — показ, копирование и печать.
 *
 * Печать — только самого чека, через скрытый iframe (printReceipt.ts), а не
 * `window.print()` всей страницы кабинета; страница — по ширине чековой ленты
 * (80 или 58 мм, выбор запоминается на компьютере) и длиной ровно в чек.
 *
 * `shiftOptions` — выбор смены прямо в окне (журнал «Смены, чеки, списания»);
 * без них окно показывает одну переданную смену (карточка смены).
 */
import { CopyOutlined, PrinterOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Modal,
  Segmented,
  Select,
  Space,
  Spin,
  Typography,
} from "antd";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import { getShiftReceipt } from "@/api/sales";
import {
  getPaperWidth,
  loadReceiptFont,
  printReceiptText,
  RECEIPT_FONT_CSS,
  setPaperWidth,
  type PaperWidth,
} from "@/components/printReceipt";

export default function ShiftReceiptModal({
  open,
  shiftId,
  onClose,
  title = "Чек за смену",
  shiftOptions,
}: {
  open: boolean;
  shiftId: number | null;
  onClose: () => void;
  title?: string;
  shiftOptions?: { value: number; label: string }[];
}) {
  const { message } = App.useApp();
  const [kind, setKind] = useState<"totals" | "full">("totals");
  const [picked, setPicked] = useState<number | null>(shiftId);
  /** Лента чекового принтера — запоминается на этом компьютере. */
  const [paper, setPaper] = useState<PaperWidth>(getPaperWidth);
  // Шрифт чека — заранее: и превью им же, и к нажатию «Печать» он уже загружен.
  useEffect(() => {
    void loadReceiptFont();
  }, []);
  useEffect(() => {
    if (open) setPicked(shiftId);
  }, [open, shiftId]);

  const receipt = useQuery({
    queryKey: ["shift-receipt", picked, kind],
    queryFn: () => getShiftReceipt(picked!, { items: kind === "full" }),
    enabled: open && picked != null,
  });
  const content = receipt.data?.content ?? null;

  const print = () => {
    if (!content) return;
    if (!printReceiptText(content, title, paper)) {
      message.warning(
        "Не удалось отправить чек на печать — обновите страницу и повторите",
      );
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={title}
      width={520}
      footer={
        <Space wrap style={{ width: "100%", justifyContent: "space-between" }}>
          <Space size={6}>
            <Typography.Text type="secondary">Лента</Typography.Text>
            <Segmented
              size="small"
              value={paper}
              onChange={(v) => {
                setPaper(v as PaperWidth);
                setPaperWidth(v as PaperWidth);
              }}
              options={[
                { value: 80, label: "80 мм" },
                { value: 58, label: "58 мм" },
              ]}
            />
          </Space>
          <Space>
            <Button
              icon={<CopyOutlined />}
              disabled={!content}
              onClick={() => {
                navigator.clipboard
                  ?.writeText(content ?? "")
                  .then(() => message.success("Скопировано"))
                  .catch(() => message.error("Не удалось скопировать"));
              }}
            >
              Скопировать
            </Button>
            <Button
              type="primary"
              icon={<PrinterOutlined />}
              disabled={!content}
              onClick={print}
            >
              Печать
            </Button>
          </Space>
        </Space>
      }
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        {shiftOptions && (
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="Смена"
            style={{ width: "100%" }}
            value={picked ?? undefined}
            onChange={(v: number) => setPicked(v)}
            options={shiftOptions}
          />
        )}
        <Segmented
          block
          value={kind}
          onChange={(v) => setKind(v as "totals" | "full")}
          options={[
            { value: "totals", label: "Итоги смены" },
            { value: "full", label: "Полный чек" },
          ]}
        />
        {picked == null && <Alert type="info" message="Выберите смену" />}
        {picked != null && receipt.isPending && (
          <div style={{ textAlign: "center", padding: 24 }}>
            <Spin />
          </div>
        )}
        {receipt.isError && (
          <Alert type="error" message={errorMessage(receipt.error)} />
        )}
        {content && (
          <pre
            style={{
              // Как на бумаге (printReceipt): шрифт чека, жирный, строки с просветом.
              fontFamily: RECEIPT_FONT_CSS,
              fontWeight: 700,
              fontSize: 12,
              lineHeight: 1.5,
              margin: 0,
              background: "rgba(0,0,0,0.03)",
              padding: 12,
              borderRadius: 8,
              whiteSpace: "pre",
              overflowX: "auto",
            }}
          >
            {content}
          </pre>
        )}
      </Space>
    </Modal>
  );
}
