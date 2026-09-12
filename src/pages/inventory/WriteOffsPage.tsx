/** /write-offs — акты списания: список, фильтры и переход в карточку. */
import { PlusOutlined, SettingOutlined } from "@ant-design/icons";
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
} from "@/api/inventory";
import { fmtDate } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import {
  DOC_STATUS_OPTIONS,
  DocStatusTag,
  nameOf,
  useWarehousesLookup,
} from "@/pages/inventory/shared";
import WriteOffCategoriesModal, {
  useWriteOffCategories,
} from "@/pages/inventory/WriteOffCategoriesModal";

const { RangePicker } = DatePicker;

export default function WriteOffsPage() {
  const navigate = useNavigate();
  const { limit, offset, tablePagination, reset } = usePagination();
  const warehouses = useWarehousesLookup();
  const categories = useWriteOffCategories();

  const [status, setStatus] = useState<DocumentStatus | undefined>();
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const from = range?.[0]?.format("YYYY-MM-DD");
  const to = range?.[1]?.format("YYYY-MM-DD");

  const query = useQuery({
    queryKey: ["write-offs", { limit, offset, status, categoryId, from, to }],
    queryFn: () =>
      listDocuments({
        limit,
        offset,
        type: "write_off",
        status,
        write_off_category_id: categoryId,
        from,
        to,
      }),
  });

  const categoryById = new Map(
    (categories.data ?? []).map((c) => [c.write_off_category_id, c.name]),
  );

  const columns: ColumnsType<DocumentOut> = [
    {
      title: "№",
      dataIndex: "number",
      width: 80,
      render: (n: number | null) => n ?? "черновик",
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
      render: (id: number) => nameOf(warehouses.byId, id),
    },
    {
      title: "Категория",
      dataIndex: "write_off_category_id",
      render: (id: number | null) =>
        id == null ? "—" : (categoryById.get(id) ?? `#${id}`),
    },
    {
      title: "Комментарий",
      dataIndex: "comment",
      ellipsis: true,
      render: (v: string | null) => v || "—",
    },
    {
      title: "Строк",
      dataIndex: "lines_count",
      width: 80,
      align: "right",
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
        <h2 style={{ margin: 0 }}>Акты списания</h2>
        <Space>
          <Button
            icon={<SettingOutlined />}
            onClick={() => setCategoriesOpen(true)}
          >
            Категории
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate("/write-offs/new")}
          >
            Новый акт
          </Button>
        </Space>
      </Space>

      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          allowClear
          placeholder="Категория"
          style={{ width: 240 }}
          options={(categories.data ?? [])
            .filter((c) => c.is_active || c.write_off_category_id === categoryId)
            .map((c) => ({
              value: c.write_off_category_id,
              label: c.name,
            }))}
          value={categoryId}
          onChange={(v) => {
            setCategoryId(v);
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
        rowClassName={() => "row-clickable"}
        onRow={(row) => ({
          onClick: () => navigate(`/write-offs/${row.document_id}`),
        })}
      />

      <WriteOffCategoriesModal
        open={categoriesOpen}
        onClose={() => setCategoriesOpen(false)}
      />
    </div>
  );
}
