/** Питание сотрудников: что пробили на кассе бесплатно и кому это записано.
 *
 *  Раньше колонку «Питание» в ведомости вбивали руками из блокнота. Теперь она
 *  собирается отсюда: каждый бесплатный завтрак — чек со скидкой 100 %, сырьё
 *  списано, а сумма по ценам меню числится за сотрудником.
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
      title: "По ценам меню",
      dataIndex: "amount",
      width: 160,
      align: "right",
      render: (v: string) => (
        <Tooltip title="Эта сумма попадёт в ведомость, в колонку «Питание»">
          <b>
            <Money value={v} />
          </b>
        </Tooltip>
      ),
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
    { title: "Примечание", dataIndex: "note", render: (v) => v ?? "—" },
    {
      title: "",
      key: "actions",
      width: 130,
      render: (_v, row) =>
        row.status === "voided" ? (
          <Tag>аннулирована</Tag>
        ) : (
          <Popconfirm
            title="Аннулировать запись?"
            description="Удержание снимется. Склад НЕ вернётся: еда уже съедена."
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
