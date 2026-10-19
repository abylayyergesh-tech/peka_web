/** Вкладка «Месяц по отметкам» в личном деле: дисциплина (опоздания, ранние
 * уходы, неявки) и предварительные начисления по ставкам — то же, что видит
 * сотрудник в приложении. Деньги — только с payroll.read. */
import { Alert, DatePicker, Descriptions, Empty, Space, Spin, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  getEmployeeDiscipline,
  getEmployeeEarningsPreview,
  type DisciplineItem,
  type EarningsBasis,
} from "@/api/earnings";
import { fmtDate } from "@/components/format";
import { fmtTenge } from "@/pages/payroll/shared";

const KIND_LABEL: Record<DisciplineItem["kind"], string> = {
  late: "Опоздание",
  early_leave: "Ранний уход",
  absence: "Неявка",
};

const ABSENCE_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "не разобрана", color: "gold" },
  excused: { label: "уважительная", color: "green" },
  unexcused: { label: "неуважительная", color: "red" },
};

const BASIS_LABEL: Record<EarningsBasis, string> = {
  position: "ставка по должности",
  compensation: "ставка из «Справочника ставок»",
  salary: "оклад из «Справочника ставок»",
  none: "ставки нет",
};

const columns: ColumnsType<DisciplineItem> = [
  { title: "Дата", dataIndex: "date", width: 110, render: (d: string) => fmtDate(d) },
  { title: "Что", dataIndex: "kind", render: (k: DisciplineItem["kind"]) => KIND_LABEL[k] },
  {
    title: "Минут",
    dataIndex: "minutes",
    width: 90,
    align: "right",
    render: (m: number | null) => m ?? "—",
  },
  {
    title: "Разбор",
    render: (_v, r) => {
      if (!r.status) return null;
      const s = ABSENCE_STATUS[r.status];
      return (
        <Space size={4}>
          <Tag color={s?.color}>{s?.label ?? r.status}</Tag>
          {r.note && <Typography.Text type="secondary">{r.note}</Typography.Text>}
        </Space>
      );
    },
  },
];

export default function MonthSummaryTab({
  employeeId,
  canPayrollRead,
}: {
  employeeId: number;
  canPayrollRead: boolean;
}) {
  const [month, setMonth] = useState<Dayjs>(dayjs().startOf("month"));
  const key = month.format("YYYY-MM");
  const discipline = useQuery({
    queryKey: ["employee-discipline", employeeId, key],
    queryFn: () => getEmployeeDiscipline(employeeId, key),
  });
  const earnings = useQuery({
    queryKey: ["employee-earnings-preview", employeeId, key],
    queryFn: () => getEmployeeEarningsPreview(employeeId, key),
    enabled: canPayrollRead,
  });
  const d = discipline.data;
  const e = earnings.data;

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      <DatePicker
        picker="month"
        format="MMMM YYYY"
        allowClear={false}
        value={month}
        onChange={(v) => v && setMonth(v.startOf("month"))}
      />
      {canPayrollRead && (
        <div>
          <Typography.Title level={5}>Начисления (предварительно)</Typography.Title>
          {earnings.isPending ? (
            <Spin />
          ) : !e ? (
            <Alert type="error" showIcon message={errorMessage(earnings.error)} />
          ) : (
            <Descriptions size="small" column={{ xs: 1, md: 2 }} bordered>
              <Descriptions.Item label="Дневных смен">{e.day_shifts}</Descriptions.Item>
              <Descriptions.Item label="Ночных смен">{e.night_shifts}</Descriptions.Item>
              <Descriptions.Item label="Ставка день / ночь">
                {e.day_rate ? `${fmtTenge(e.day_rate)} / ${fmtTenge(e.night_rate)} ₸` : "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Основание">{BASIS_LABEL[e.basis]}</Descriptions.Item>
              <Descriptions.Item label="Сумма">
                <strong>{e.amount != null ? `${fmtTenge(e.amount)} ${e.currency}` : "—"}</strong>
              </Descriptions.Item>
              <Descriptions.Item label="На проверке">
                {e.on_review_shifts > 0
                  ? `${e.on_review_shifts} смен(ы) со спорной отметкой — в сумму не входят`
                  : "—"}
              </Descriptions.Item>
            </Descriptions>
          )}
        </div>
      )}
      <div>
        <Typography.Title level={5}>Дисциплина</Typography.Title>
        {discipline.isPending ? (
          <Spin />
        ) : !d ? (
          <Alert type="error" showIcon message={errorMessage(discipline.error)} />
        ) : (
          <>
            <Space wrap style={{ marginBottom: 8 }}>
              <Tag color={d.late_count ? "orange" : undefined}>
                Опозданий: {d.late_count} ({d.late_minutes} мин)
              </Tag>
              <Tag color={d.early_leave_count ? "orange" : undefined}>
                Ранних уходов: {d.early_leave_count} ({d.early_leave_minutes} мин)
              </Tag>
              <Tag color={d.absence_count ? "red" : undefined}>Неявок: {d.absence_count}</Tag>
            </Space>
            {d.items.length === 0 ? (
              <Empty description="Нарушений за месяц нет" />
            ) : (
              <Table
                rowKey={(r) => `${r.date}-${r.kind}`}
                size="small"
                dataSource={d.items}
                columns={columns}
                pagination={false}
              />
            )}
          </>
        )}
      </div>
    </Space>
  );
}
