/** /documents — складские документы: список с фильтрами (тип, статус, склад,
 *  приём перемещения, период) и создание. Склад — откуда или куда. */
import { CameraOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, DatePicker, Select, Space, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { fetchAllPages } from "@/api/client";
import {
  listDocuments,
  type DocumentOut,
  type DocumentStatus,
  type DocumentType,
  type ReceiptStatus,
} from "@/api/inventory";
import { Money, fmtDate } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import DocumentCreateModal from "@/pages/inventory/DocumentCreateModal";
import { EntityTag, entityFilterOptions, useCompanyEntities } from "@/pages/finance/companyEntities";
import { useSupplierRefs } from "@/pages/procurement/refData";
import {
  DOC_STATUS_OPTIONS,
  DOC_TYPE_OPTIONS,
  DocStatusTag,
  DocTypeTag,
  nameOf,
  RECEIPT_STATUS_OPTIONS,
  ReceiptStatusTag,
  useWarehousesLookup,
} from "@/pages/inventory/shared";
import { ExcelExportButton, columnsFromTable } from "@/components/excel";

const { RangePicker } = DatePicker;

export default function DocumentsPage() {
  const navigate = useNavigate();
  const { limit, offset, tablePagination, reset } = usePagination();
  const warehouses = useWarehousesLookup();

  const [type, setType] = useState<DocumentType | undefined>();
  const [status, setStatus] = useState<DocumentStatus | undefined>();
  const [warehouseId, setWarehouseId] = useState<number | undefined>();
  const [receipt, setReceipt] = useState<ReceiptStatus | undefined>();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [entity, setEntity] = useState<string | undefined>();
  const [supplierId, setSupplierId] = useState<number | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const entities = useCompanyEntities();
  const suppliers = useSupplierRefs();

  const from = range?.[0]?.format("YYYY-MM-DD");
  const to = range?.[1]?.format("YYYY-MM-DD");

  const query = useQuery({
    queryKey: ["documents", { limit, offset, type, status, from, to, warehouseId, receipt,
      entity, supplierId }],
    queryFn: () => listDocuments({ limit, offset, type, status, from, to,
      warehouse_id: warehouseId, receipt_status: receipt,
      company_entity: entity, supplier_id: supplierId }),
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
      render: (v: string | null, row) =>
        v || (row.supplier_id != null ? suppliers.byId.get(row.supplier_id) : null) || "—",
    },
    {
      title: "Юр. лицо",
      dataIndex: "company_entity_id",
      render: (v: number | null, row) =>
        row.type === "receipt" || v != null ? <EntityTag entities={entities.data} id={v} /> : "—",
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
      render: (s: DocumentStatus, row) => (
        <Space size={4} wrap>
          <DocStatusTag status={s} />
          <ReceiptStatusTag status={row.receipt_status} />
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space
        style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}
      >
        <h2 style={{ margin: 0 }}>Накладные</h2>
        <Space>
          <ExcelExportButton
            fileName="Накладные"
            sheets={async () => [{
              name: "Документы",
              columns: columnsFromTable(columns),
              rows: await fetchAllPages((p) => listDocuments({
                ...p, type, status, from, to, warehouse_id: warehouseId, receipt_status: receipt,
                company_entity: entity, supplier_id: supplierId,
              })),
            }]}
          />
          <Button
            icon={<CameraOutlined />}
            onClick={() => navigate("/documents/digitize")}
          >
            С фото
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
          >
            Создать
          </Button>
        </Space>
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
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Склад"
          style={{ width: 180 }}
          options={warehouses.options}
          value={warehouseId}
          onChange={(v) => {
            setWarehouseId(v);
            reset();
          }}
        />
        <Select
          allowClear
          placeholder="Приём перемещения"
          style={{ width: 210 }}
          options={RECEIPT_STATUS_OPTIONS}
          value={receipt}
          onChange={(v) => {
            setReceipt(v);
            reset();
          }}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Поставщик"
          style={{ width: 200 }}
          options={suppliers.options}
          value={supplierId}
          onChange={(v) => {
            setSupplierId(v);
            reset();
          }}
        />
        <Select
          allowClear
          placeholder="Наше юр. лицо"
          style={{ width: 200 }}
          options={entityFilterOptions(entities.data)}
          value={entity}
          onChange={(v) => {
            setEntity(v);
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
          onClick: () =>
            navigate(
              row.type === "write_off"
                ? `/write-offs/${row.document_id}`
                : `/documents/${row.document_id}`,
            ),
        })}
      />

      <DocumentCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => {
          setCreateOpen(false);
          navigate(`/documents/${id}`); // списание само уйдёт на /write-offs/:id
        }}
      />
    </div>
  );
}
