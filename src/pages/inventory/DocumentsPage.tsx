/** /documents — складские документы: список с фильтрами (тип, статус, период)
 *  и создание. NB: бэкенд GET /documents НЕ поддерживает фильтр по складу. */
import { PlusOutlined } from "@ant-design/icons";
import { Button, DatePicker, Select, Space, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import {
  listDocuments,
  type DocumentOut,
  type DocumentStatus,
  type DocumentType,
} from "@/api/inventory";
import { Money, fmtDate } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import DocumentCreateModal from "@/pages/inventory/DocumentCreateModal";
import {
  DOC_STATUS_OPTIONS,
  DOC_TYPE_OPTIONS,
  DocStatusTag,
  DocTypeTag,
  nameOf,
  useWarehousesLookup,
} from "@/pages/inventory/shared";

const { RangePicker } = DatePicker;

export default function DocumentsPage() {
  const navigate = useNavigate();
  const { limit, offset, tablePagination, reset } = usePagination();
  const warehouses = useWarehousesLookup();

  const [type, setType] = useState<DocumentType | undefined>();
  const [status, setStatus] = useState<DocumentStatus | undefined>();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const from = range?.[0]?.format("YYYY-MM-DD");
  const to = range?.[1]?.format("YYYY-MM-DD");

  const query = useQuery({
    queryKey: ["documents", { limit, offset, type, status, from, to }],
    queryFn: () => listDocuments({ limit, offset, type, status, from, to }),
  });

  const columns: ColumnsType<DocumentOut> = [
    {
      title: "№",
      dataIndex: "number",
      width: 70,
      render: (n: number | null) => n ?? "—",
    },
    {
      title: "Тип",
      dataIndex: "type",
      width: 150,
      render: (t: DocumentType) => <DocTypeTag type={t} />,
    },
    {
      title: "Дата",
      dataIndex: "doc_date",
      width: 110,
      render: (v: string) => fmtDate(v),
    },
    {
      title: "Склад",
      dataIndex: "warehouse_id",
      render: (_, row) => {
        const src = nameOf(warehouses.byId, row.warehouse_id);
        return row.target_warehouse_id != null
          ? `${src} → ${nameOf(warehouses.byId, row.target_warehouse_id)}`
          : src;
      },
    },
    {
      title: "Контрагент",
      dataIndex: "counterparty",
      render: (v: string | null) => v || "—",
    },
    {
      // Из агрегата, а не из `lines`: в списке строк нет, и раньше здесь всегда
      // стоял ноль.
      title: "Строк",
      dataIndex: "lines_count",
      width: 80,
      align: "right",
    },
    {
      title: "Сумма",
      dataIndex: "total_amount",
      width: 140,
      align: "right",
      // Прочерк, а не ноль: у расходных документов суммы не существует, и ноль
      // читался бы как «отдали бесплатно».
      render: (v: string | null) => (v == null ? "—" : <Money value={v} />),
    },
    {
      title: "Статус",
      dataIndex: "status",
      width: 120,
      render: (s: DocumentStatus) => <DocStatusTag status={s} />,
    },
  ];

  return (
    <div>
      <Space
        style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}
      >
        <h2 style={{ margin: 0 }}>Складские документы</h2>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setCreateOpen(true)}
        >
          Создать
        </Button>
      </Space>

      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          allowClear
          placeholder="Тип"
          style={{ width: 180 }}
          options={DOC_TYPE_OPTIONS}
          value={type}
          onChange={(v) => {
            setType(v);
            reset();
          }}
        />
        <Select
          allowClear
          placeholder="Статус"
          style={{ width: 160 }}
          options={DOC_STATUS_OPTIONS}
          value={status}
          onChange={(v) => {
            setStatus(v);
            reset();
          }}
        />
        <RangePicker
          format="DD.MM.YYYY"
          value={range}
          onChange={(v) => {
            setRange(v as [Dayjs, Dayjs] | null);
            reset();
          }}
        />
      </Space>

      <Table<DocumentOut>
        rowKey="document_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        pagination={tablePagination(query.data?.total)}
        columns={columns}
        onRow={(row) => ({
          onClick: () => navigate(`/documents/${row.document_id}`),
          style: { cursor: "pointer" },
        })}
      />

      <DocumentCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => {
          setCreateOpen(false);
          navigate(`/documents/${id}`);
        }}
      />
    </div>
  );
}
