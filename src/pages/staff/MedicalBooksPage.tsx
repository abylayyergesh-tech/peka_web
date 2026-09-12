/** /employees/medical-books — журнал медкнижек и сроки. */
import { Select, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Link } from "react-router-dom";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { listMedicalBooks, type MedicalAlert, type MedicalBookOut } from "@/api/staff";
import { fmtDate } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import { MedicalAlertTag } from "@/pages/staff/shared";

const ALERT_OPTIONS = [
  { value: "all", label: "Все действующие" },
  { value: "expired", label: "Просроченные" },
  { value: "expiring", label: "Истекают (30 дней)" },
];

export default function MedicalBooksPage() {
  const { limit, offset, tablePagination, reset } = usePagination();
  const [alert, setAlert] = useState<"all" | "expired" | "expiring">("all");

  const query = useQuery({
    queryKey: ["medical-books-journal", { limit, offset, alert }],
    queryFn: () =>
      listMedicalBooks({
        limit,
        offset,
        alert,
        within_days: 30,
      }),
  });

  const columns: ColumnsType<MedicalBookOut> = [
    {
      title: "Сотрудник",
      dataIndex: "employee_name",
      render: (v, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{v || `№${row.employee_id}`}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.title}
          </Typography.Text>
        </Space>
      ),
    },
    { title: "Подпись", dataIndex: "signed_on", width: 120, render: (v) => fmtDate(v) },
    { title: "До", dataIndex: "expires_on", width: 120, render: (v) => fmtDate(v) },
    {
      title: "Статус",
      dataIndex: "alert",
      width: 180,
      render: (v: MedicalAlert, row) => (
        <Space>
          <MedicalAlertTag alert={v} daysLeft={row.days_left} />
          {!row.is_active && <Tag>Снята</Tag>}
        </Space>
      ),
    },
    { title: "Комментарий", dataIndex: "note", render: (v) => v || "—" },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <div>
          <h2 style={{ margin: 0 }}>Медкнижки</h2>
          <Typography.Text type="secondary">
            Срок и дата подписи. Скан лежит в личном деле сотрудника. Оповещение — список
            ниже и баннер на{" "}
            <Link to="/employees">сотрудниках</Link>; писем система сама не шлёт.
          </Typography.Text>
        </div>
        <Select
          value={alert}
          options={ALERT_OPTIONS}
          style={{ width: 240 }}
          onChange={(v) => {
            setAlert(v);
            reset();
          }}
        />
      </Space>
      <Table<MedicalBookOut>
        rowKey="medical_book_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        columns={columns}
        pagination={tablePagination(query.data?.total)}
      />
    </div>
  );
}
