/** Питание сотрудников: что взяли на кассе и что с кого удержат.
 *
 *  **Еда не бесплатная.** На кассе сотрудник не платит (чек со скидкой 100 %,
 *  сырьё списано), но сумма по ценам меню удерживается из его зарплаты — это и
 *  есть колонка «Питание» в ведомости, которую раньше вбивали руками.
 *
 *  Колонка «Удержано» показывает, какая ведомость запись уже забрала. Пусто —
 *  ещё не удержано, и запись попадёт в ближайшую зарплатную ведомость: даже если
 *  её пробили после выплаты прошлой (раньше такие обеды не удерживал никто).
 *
 *  Две суммы рядом намеренно: «по ценам меню» — то, что удержится из зарплаты,
 *  «себестоимость» — во что это обошлось организации. Это разные деньги, и
 *  показывать одну вместо другой значит отвечать не на тот вопрос. */
import { Alert, Button, Card, Popconfirm, Space, Table, Tag, Tooltip, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  fetchStaffMealsSummary,
  listStaffMeals,
  voidStaffMeal,
  type StaffMealOut,
  type StaffMealsSummaryRow,
} from "@/api/payroll";
import { fmtDate, fmtMoney, fmtQty, Money } from "@/components/format";
import { ReportRangePicker, useReportRange } from "@/pages/finance/reportRange";

const KIND_LABELS: Record<string, string> = {
  breakfast: "Завтрак",
  lunch: "Обед",
  dinner: "Ужин",
  other: "Другое",
};

export default function StaffMealsPage() {
  const { range, setRange, params } = useReportRange();
  const [page, setPage] = useState({ limit: 50, offset: 0 });
  const queryClient = useQueryClient();

  const summary = useQuery({
    queryKey: ["staff-meals", "summary", params],
    queryFn: () => fetchStaffMealsSummary(params),
  });
  const journal = useQuery({
    queryKey: ["staff-meals", "list", params, page],
    queryFn: () => listStaffMeals({ ...params, ...page, include_voided: true }),
  });

  const cancel = useMutation({
    mutationFn: (id: number) => voidStaffMeal(id),
    onSuccess: () => {
      message.success("Запись аннулирована — удержание снято");
      queryClient.invalidateQueries({ queryKey: ["staff-meals"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const summaryColumns: ColumnsType<StaffMealsSummaryRow> = [
    { title: "Сотрудник", dataIndex: "employee_name" },
    { title: "Приёмов", dataIndex: "meals", width: 100, align: "right" },
    {
      title: "В кредит",
      dataIndex: "amount",
      width: 140,
      align: "right",
      render: (v: string) => (
        <Tooltip title="Удержится из зарплаты — колонка «Питание»">
          <b>
            <Money value={v} />
          </b>
        </Tooltip>
      ),
    },
    {
      title: "Оплачено",
      dataIndex: "paid_amount",
      width: 140,
      align: "right",
      render: (v: string) => <Money value={v} />,
    },
    {
      title: "Себестоимость",
      dataIndex: "cost",
      width: 160,
      align: "right",
      render: (v: string) => <Money value={v} />,
    },
  ];

  const journalColumns: ColumnsType<StaffMealOut> = [
    { title: "Дата", dataIndex: "meal_date", width: 120, render: (v: string) => fmtDate(v) },
    { title: "Сотрудник", dataIndex: "employee_name", render: (v) => v ?? "—" },
    {
      title: "Что",
      dataIndex: "lines",
      render: (lines: StaffMealOut["lines"]) =>
        lines.length === 0
          ? "—"
          : lines.map((l) => `${l.name} × ${fmtQty(l.quantity)}`).join(", "),
    },
    {
      title: "Приём",
      dataIndex: "kind",
      width: 110,
      render: (v: string) => KIND_LABELS[v] ?? v,
    },
    {
      title: "Расчёт",
      dataIndex: "settlement",
      width: 120,
      render: (v: StaffMealOut["settlement"]) =>
        v === "paid" ? (
          <Tag color="green">оплачено</Tag>
        ) : (
          <Tag color="gold">в кредит</Tag>
        ),
    },
    {
      title: "Чек",
      dataIndex: "check_number",
      width: 90,
      render: (v: number | null, row) => (v != null ? `№${v}` : `#${row.check_id}`),
    },
    {
      title: "По ценам меню",
      dataIndex: "amount",
      width: 150,
      align: "right",
      render: (v: string) => <Money value={v} />,
    },
    {
      title: "Себестоимость",
      dataIndex: "cost",
      width: 150,
      align: "right",
      render: (v: string) => <Money value={v} />,
    },
    {
      title: "Удержано",
      dataIndex: "deducted_payroll_run_id",
      width: 130,
      render: (v: number | null) =>
        v == null ? (
          <Tooltip title="Попадёт в ближайшую зарплатную ведомость">
            <Tag color="gold">ещё нет</Tag>
          </Tooltip>
        ) : (
          <Tooltip title="Удержано выплаченной ведомостью — аннулировать нельзя">
            <Tag color="green">ведомость №{v}</Tag>
          </Tooltip>
        ),
    },
    { title: "Примечание", dataIndex: "note", render: (v) => v ?? "—" },
    {
      title: "",
      key: "actions",
      width: 130,
      render: (_v, row) =>
        row.status === "voided" ? (
          <Tag>аннулирована</Tag>
        ) : row.deducted_payroll_run_id != null ? (
          <Tooltip title="Деньги уже удержаны выплаченной ведомостью">
            <span style={{ color: "#8c8c8c" }}>—</span>
          </Tooltip>
        ) : (
          <Popconfirm
            title="Аннулировать запись?"
            description="Запись снимется с журнала и из удержания, если оно ещё не прошло. Склад НЕ вернётся."
            okText="Аннулировать"
            cancelText="Отмена"
            onConfirm={() => cancel.mutate(row.staff_meal_id)}
          >
            <Button size="small" danger type="text">
              Аннулировать
            </Button>
          </Popconfirm>
        ),
    },
  ];

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Питание сотрудников</h2>

      <Space wrap style={{ marginBottom: 16 }}>
        <ReportRangePicker value={range} onChange={setRange} />
      </Space>

      {(summary.isError || journal.isError) && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message={errorMessage(summary.error ?? journal.error)}
        />
      )}

      <Card
        size="small"
        style={{ marginBottom: 16 }}
        title="Итоги по сотрудникам — это и есть колонка «Питание» в ведомости"
      >
        <Table<StaffMealsSummaryRow>
          rowKey="employee_id"
          size="small"
          loading={summary.isPending}
          dataSource={summary.data?.rows ?? []}
          columns={summaryColumns}
          pagination={false}
          locale={{ emptyText: "За период питание не пробивали" }}
          summary={() =>
            summary.data && summary.data.rows.length > 0 ? (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}>
                  <b>Итого</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <b>{summary.data.meals}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">
                  <b>{fmtMoney(summary.data.amount)}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right">
                  <b>{fmtMoney(summary.data.paid_amount)}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right">
                  <b>{fmtMoney(summary.data.cost)}</b>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            ) : null
          }
        />
      </Card>

      <Table<StaffMealOut>
        rowKey="staff_meal_id"
        size="small"
        loading={journal.isPending}
        dataSource={journal.data?.items ?? []}
        columns={journalColumns}
        scroll={{ x: 1300 }}
        rowClassName={(row) => (row.status === "voided" ? "row-voided" : "")}
        pagination={{
          current: Math.floor(page.offset / page.limit) + 1,
          pageSize: page.limit,
          total: journal.data?.total ?? 0,
          showSizeChanger: true,
          showTotal: (t) => `${t} записей`,
          onChange: (p, size) => setPage({ limit: size, offset: (p - 1) * size }),
        }}
      />
    </div>
  );
}
