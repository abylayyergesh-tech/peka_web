/** /employees/disciplinaries — журнал дисциплинарных взысканий. */
import { Select, Space, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  listDisciplinaries,
  type DisciplinaryKind,
  type DisciplinaryOut,
} from "@/api/staff";
import { fmtDate } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import { DISCIPLINARY_OPTIONS, DisciplinaryKindTag } from "@/pages/staff/shared";

export default function DisciplinariesPage() {
  const { limit, offset, tablePagination, reset } = usePagination();
  const [kind, setKind] = useState<DisciplinaryKind | undefined>();

  const query = useQuery({
    queryKey: ["disciplinaries-journal", { limit, offset, kind }],
    queryFn: () => listDisciplinaries({ limit, offset, kind }),
  });

  const columns: ColumnsType<DisciplinaryOut> = [
    {
      title: "Сотрудник",
      dataIndex: "employee_name",
      render: (v, row) => v || `№${row.employee_id}`,
    },
    {
      title: "Вид",
      dataIndex: "kind",
      width: 170,
      render: (v: DisciplinaryKind) => <DisciplinaryKindTag kind={v} />,
    },
    { title: "Дата", dataIndex: "issued_on", width: 120, render: (v) => fmtDate(v) },
    { title: "Основание", dataIndex: "reason" },
    { title: "Кто внёс", dataIndex: "issued_by_name", width: 160, render: (v) => v || "—" },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <div>
          <h2 style={{ margin: 0 }}>Дисциплинарные взыскания</h2>
          <Typography.Text type="secondary">
            Кадровый журнал. Это не штраф в ведомости — сумму в зарплату вносят отдельно.
          </Typography.Text>
        </div>
        <Select
          allowClear
          placeholder="Все виды"
          value={kind}
          options={DISCIPLINARY_OPTIONS}
          style={{ width: 220 }}
          onChange={(v) => {
            setKind(v);
            reset();
          }}
        />
      </Space>
      <Table<DisciplinaryOut>
        rowKey="disciplinary_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        columns={columns}
        pagination={tablePagination(query.data?.total)}
      />
    </div>
  );
}
