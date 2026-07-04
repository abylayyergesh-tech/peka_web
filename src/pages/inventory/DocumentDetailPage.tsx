/** /documents/:id — карточка документа: шапка, строки, действия
 *  (провести / редактировать черновик / удалить). */
import { ArrowLeftOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Descriptions,
  Popconfirm,
  Result,
  Space,
  Spin,
  Table,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  deleteDocument,
  getDocument,
  postDocument,
  type DocumentLineOut,
} from "@/api/inventory";
import { useCan } from "@/auth/store";
import { fmtDate, fmtDateTime, fmtMoney, fmtQty } from "@/components/format";
import DocumentEditModal from "@/pages/inventory/DocumentEditModal";
import {
  DocStatusTag,
  DocTypeTag,
  isConsumptionType,
  nameOf,
  useProductsLookup,
  useWarehousesLookup,
} from "@/pages/inventory/shared";

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const docId = Number(id);
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("inventory.manage");
  const canPostReceipt = useCan("receipt.post");
  const [editOpen, setEditOpen] = useState(false);

  const products = useProductsLookup();
  const warehouses = useWarehousesLookup();

  const query = useQuery({
    queryKey: ["document", docId],
    queryFn: () => getDocument(docId),
    enabled: Number.isFinite(docId),
  });

  const post = useMutation({
    mutationFn: () => postDocument(docId),
    onSuccess: () => {
      message.success("Документ проведён");
      queryClient.invalidateQueries({ queryKey: ["document", docId] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: () => deleteDocument(docId),
    onSuccess: () => {
      message.success("Черновик удалён");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      navigate("/documents");
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  if (query.isPending) {
    return (
      <div style={{ textAlign: "center", padding: 48 }}>
        <Spin />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <Result
        status="404"
        title="Документ не найден"
        extra={
          <Button onClick={() => navigate("/documents")}>К документам</Button>
        }
      />
    );
  }

  const doc = query.data;
  const isDraft = doc.status === "draft";
  const isReceipt = doc.type === "receipt";
  const isCount = doc.type === "inventory_count";
  const canPost = isReceipt ? canManage || canPostReceipt : canManage;
  // receipt drafts are editable server-side but not reconstructable from the API
  // (DocumentOut omits supplier_id/internal/free_goods), so they're excluded.
  const editableType = isConsumptionType(doc.type) || isCount;
  const canEdit = canManage && editableType;

  const columns: ColumnsType<DocumentLineOut> = [
    {
      title: "Продукт",
      dataIndex: "product_id",
      render: (pid: number) => nameOf(products.byId, pid),
    },
    {
      title: isCount ? "Факт. кол-во" : "Количество",
      dataIndex: "quantity",
      align: "right",
      width: 140,
      render: (v: string) => fmtQty(v),
    },
  ];
  if (isCount) {
    columns.push({
      title: "Ожид. кол-во",
      dataIndex: "expected_quantity",
      align: "right",
      width: 140,
      render: (v: string | null) => (v == null ? "—" : fmtQty(v)),
    });
  }
  if (isReceipt || isCount) {
    columns.push({
      title: "Цена",
      dataIndex: "price",
      align: "right",
      width: 140,
      render: (v: string | null) => (v == null ? "—" : fmtMoney(v)),
    });
  }
  if (isReceipt) {
    columns.push({
      title: "Сумма",
      align: "right",
      width: 150,
      render: (_, row) =>
        row.price == null
          ? "—"
          : fmtMoney(Number(row.quantity) * Number(row.price)),
    });
  }

  const receiptTotal = isReceipt
    ? doc.lines.reduce(
        (acc, l) => acc + (l.price == null ? 0 : Number(l.quantity) * Number(l.price)),
        0,
      )
    : null;

  return (
    <div>
      <Space
        style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}
      >
        <Space>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate("/documents")}
          />
          <h2 style={{ margin: 0 }}>
            Документ №{doc.number ?? doc.id} <DocTypeTag type={doc.type} />
          </h2>
        </Space>
        {isDraft && (
          <Space>
            {canEdit && (
              <Button onClick={() => setEditOpen(true)}>Редактировать</Button>
            )}
            {canPost && (
              <Popconfirm
                title="Провести документ?"
                description="После проведения документ нельзя изменить."
                okText="Провести"
                cancelText="Отмена"
                onConfirm={() => post.mutate()}
              >
                <Button type="primary" loading={post.isPending}>
                  Провести
                </Button>
              </Popconfirm>
            )}
            {canManage && (
              <Popconfirm
                title="Удалить черновик?"
                okText="Удалить"
                okButtonProps={{ danger: true }}
                cancelText="Отмена"
                onConfirm={() => remove.mutate()}
              >
                <Button danger loading={remove.isPending}>
                  Удалить
                </Button>
              </Popconfirm>
            )}
          </Space>
        )}
      </Space>

      <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Тип">
          <DocTypeTag type={doc.type} />
        </Descriptions.Item>
        <Descriptions.Item label="Статус">
          <DocStatusTag status={doc.status} />
        </Descriptions.Item>
        <Descriptions.Item label={doc.target_warehouse_id != null ? "Откуда" : "Склад"}>
          {nameOf(warehouses.byId, doc.warehouse_id)}
        </Descriptions.Item>
        {doc.target_warehouse_id != null && (
          <Descriptions.Item label="Куда">
            {nameOf(warehouses.byId, doc.target_warehouse_id)}
          </Descriptions.Item>
        )}
        <Descriptions.Item label="Дата">{fmtDate(doc.doc_date)}</Descriptions.Item>
        <Descriptions.Item label="Контрагент">
          {doc.counterparty || "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Создан">
          {fmtDateTime(doc.created_at)}
        </Descriptions.Item>
        <Descriptions.Item label="Проведён">
          {doc.posted_at ? fmtDateTime(doc.posted_at) : "—"}
        </Descriptions.Item>
      </Descriptions>

      {isDraft && isReceipt && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="Редактирование строк прихода недоступно"
          description="API документа не возвращает поставщика и признак бонуса, поэтому черновик прихода можно только провести или удалить."
        />
      )}

      <Table<DocumentLineOut>
        rowKey="id"
        size="small"
        dataSource={doc.lines}
        columns={columns}
        pagination={false}
        summary={() =>
          receiptTotal != null ? (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={columns.length - 1} align="right">
                <b>Итого</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right">
                <b>{fmtMoney(receiptTotal)}</b>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          ) : null
        }
      />

      {editableType && (
        <DocumentEditModal
          open={editOpen}
          doc={doc}
          onClose={() => setEditOpen(false)}
          onSaved={() => setEditOpen(false)}
        />
      )}
    </div>
  );
}
