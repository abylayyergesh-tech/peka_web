/** Чек за смену: тот же документ, что в кассе («Общий чек за смену»), в двух
 * подробностях. «Итоги смены» — Z-отчёт, который сдаёт кассир; «Полный чек» —
 * плюс все проданные за смену позиции одной сводкой (её просят пекарня и
 * бухгалтер). Текст готовит бэкенд, здесь — показ, копирование и печать.
 *
 * Печать — только самого чека, через скрытый iframe (printReceipt.ts), а не
 * `window.print()` всей страницы кабинета.
 *
 * `shiftOptions` — выбор смены прямо в окне (журнал «Смены, чеки, списания»);
 * без них окно показывает одну переданную смену (карточка смены).
 */
import { CopyOutlined, PrinterOutlined } from "@ant-design/icons";
import { Alert, App, Button, Modal, Segmented, Select, Space, Spin } from "antd";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import { getShiftReceipt } from "@/api/sales";
import { printReceiptText } from "@/components/printReceipt";

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
    if (!printReceiptText(content, title)) {
      message.warning("Не удалось отправить чек на печать — обновите страницу и повторите");
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={title}
      width={520}
      footer={
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
          <Button type="primary" icon={<PrinterOutlined />} disabled={!content} onClick={print}>
            Печать
          </Button>
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
        {receipt.isError && <Alert type="error" message={errorMessage(receipt.error)} />}
        {content && (
          <pre
            style={{
              fontFamily: '"Consolas", "Courier New", monospace',
              fontSize: 12,
              lineHeight: 1.35,
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
