/** /documents/:id — карточка документа: шапка, строки, действия
 *  (провести / редактировать черновик / удалить / отменить).
 *
 *  Перемещение, которое ждёт приёма, проводит приём: в приложении — его
 *  ответственный, здесь — руководство («Принять»). Недостача при приёме
 *  списывается актом на складе-получателе, ссылка на акт — в карточке. */
import { ArrowLeftOutlined, PaperClipOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Result,
  Space,
  Spin,
  Table,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  cancelDocument,
  deleteDocument,
  getDocument,
  postDocument,
  receiveTransfer,
  type DocumentLineOut,
} from "@/api/inventory";
import { useCan } from "@/auth/store";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import { fmtDate, fmtDateTime, fmtMoney, fmtQty } from "@/components/format";
import DocumentEditModal from "@/pages/inventory/DocumentEditModal";
import {
  DocStatusTag,
  DocTypeTag,
  isConsumptionType,
  nameOf,
  ReceiptStatusTag,
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
  /** Окно проведения: там же предлагается приложить фото накладной. */
  const [postOpen, setPostOpen] = useState(false);
  /** Приём перемещения за ответственного: сколько принято по строкам. */
  const [received, setReceived] = useState<Record<number, number> | null>(null);
  const [receiptComment, setReceiptComment] = useState("");

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

  const cancel = useMutation({
    mutationFn: () => cancelDocument(docId),
    onSuccess: () => {
      message.success("Документ отменён");
      queryClient.invalidateQueries({ queryKey: ["document", docId] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const receive = useMutation({
    mutationFn: () =>
      receiveTransfer(docId, {
        lines: Object.entries(received ?? {}).map(([lineId, qty]) => ({
          document_line_id: Number(lineId),
          received_quantity: String(qty),
        })),
        comment: receiptComment.trim() || null,
      }),
    onSuccess: (d) => {
      message.success(d.receipt_status === "received_with_discrepancy"
        ? "Принято с расхождением — недостача списана актом"
        : "Перемещение принято");
      setReceived(null);
      queryClient.invalidateQueries({ queryKey: ["document", docId] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
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
  if (doc.type === "write_off") {
    return <Navigate to={`/write-offs/${doc.document_id}`} replace />;
  }
  const isDraft = doc.status === "draft";
  const awaiting = doc.receipt_status === "awaiting";
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
      title: isCount ? "Факт. кол-во" : doc.type === "transfer" ? "Отправлено" : "Количество",
      dataIndex: "quantity",
      align: "right",
      width: 140,
      render: (v: string) => fmtQty(v),
    },
  ];
  if (doc.type === "transfer" && doc.receipt_status && doc.receipt_status !== "awaiting") {
    columns.push({
      title: "Принято",
      dataIndex: "received_quantity",
      align: "right",
      width: 140,
      render: (v: string | null, row) => {
        const short = v != null && Number(v) < Number(row.quantity);
        return <Typography.Text type={short ? "danger" : undefined}>{fmtQty(v)}</Typography.Text>;
      },
    });
  }
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
            Документ №{doc.number ?? doc.document_id} <DocTypeTag type={doc.type} />
          </h2>
        </Space>
        {isDraft && (
          <Space>
            {canEdit && !awaiting && (
              <Button onClick={() => setEditOpen(true)}>Редактировать</Button>
            )}
            {canPost && !awaiting && (
              <Button type="primary" loading={post.isPending} onClick={() => setPostOpen(true)}>
                Провести
              </Button>
            )}
            {canManage && awaiting && (
              <Button
                type="primary"
                onClick={() => {
                  setReceiptComment("");
                  setReceived(Object.fromEntries(
                    doc.lines.map((l) => [l.document_line_id, Number(l.quantity)])));
                }}
              >
                Принять
              </Button>
            )}
            {canManage && (
              <Popconfirm
                title="Отменить документ?"
                description="Останется в журнале со статусом «Отменён»."
                okText="Отменить документ"
                cancelText="Нет"
                onConfirm={() => cancel.mutate()}
              >
                <Button loading={cancel.isPending}>Отменить</Button>
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
        {doc.created_by_name && (
          <Descriptions.Item label="Автор">{doc.created_by_name}</Descriptions.Item>
        )}
        {doc.comment && <Descriptions.Item label="Комментарий">{doc.comment}</Descriptions.Item>}
        {doc.receipt_status && (
          <Descriptions.Item label="Приём">
            <Space size={4} wrap>
              <ReceiptStatusTag status={doc.receipt_status} />
              {doc.received_by_name && <span>{doc.received_by_name}, {fmtDateTime(doc.received_at)}</span>}
              {doc.discrepancy_document_id && (
                <Link to={`/write-offs/${doc.discrepancy_document_id}`}>акт недостачи</Link>
              )}
            </Space>
          </Descriptions.Item>
        )}
        {doc.receipt_comment && (
          <Descriptions.Item label="Комментарий приёма">{doc.receipt_comment}</Descriptions.Item>
        )}
      </Descriptions>

      {awaiting && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="Ждёт приёма на складе-получателе"
          description="Остатки изменятся, когда ответственный примет товар в приложении. Принять за него можно кнопкой «Принять»."
        />
      )}

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
        rowKey="document_line_id"
        size="small"
        dataSource={doc.lines}
        columns={columns}
        // Накладная из оцифровки или из iiko — это сотни строк, и без страниц
        // карточка превращалась в бесконечную прокрутку. Строки приходят вместе
        // с документом, поэтому страницы считаются на клиенте: доливать с
        // сервера нечего.
        pagination={{
          pageSize: 50,
          showSizeChanger: true,
          pageSizeOptions: [50, 100, 200],
          showTotal: (t) => `Строк: ${t}`,
        }}
        summary={() =>
          receiptTotal != null ? (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={columns.length - 1} align="right">
                {/* «по документу», а не просто «Итого»: сумма считается по всем
                    строкам, а под ней на второй странице видно только часть —
                    без уточнения итог читался бы как сумма страницы. */}
                <b>Итого по документу</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right">
                <b>{fmtMoney(receiptTotal)}</b>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          ) : null
        }
      />

      {/* Фото бумажной накладной. Живёт рядом с документом всегда, а не только
          у прихода: сфотографировать бумагу могут и к списанию, и к перемещению.
          Файлы отдаёт бэкенд по авторизованной ручке. */}
      <Card
        size="small"
        title={
          <Space>
            <PaperClipOutlined />
            Фото накладной
          </Space>
        }
        style={{ marginTop: 16 }}
      >
        <AttachmentsPanel
          owner={{ kind: "invoice", documentId: docId }}
          canManage={canPost || canManage}
          emptyText="Фото накладной не приложены"
          uploadHint="Фото бумажной накладной или её pdf"
        />
      </Card>

      {/* Проведение: перед необратимым действием предлагаем приложить фото —
          после проведения к бумаге возвращаются уже за сверкой, и если её не
          сняли сейчас, не снимут никогда. */}
      <Modal
        open={postOpen}
        title="Провести документ"
        okText="Провести"
        cancelText="Отмена"
        confirmLoading={post.isPending}
        onCancel={() => setPostOpen(false)}
        onOk={() => post.mutate(undefined, { onSuccess: () => setPostOpen(false) })}
        width={560}
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="После проведения документ нельзя изменить"
          description="Остатки и себестоимость пересчитаются по строкам документа."
        />
        <Typography.Text strong>Фото накладной</Typography.Text>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
          Необязательно, но лучше сейчас: файл сохраняется сразу, отдельной кнопки
          «сохранить» у него нет.
        </Typography.Paragraph>
        <AttachmentsPanel
          owner={{ kind: "invoice", documentId: docId }}
          uploadHint="Снимок бумажной накладной или pdf"
          emptyText="Пока ничего не приложено"
        />
      </Modal>

      <Modal
        open={received != null}
        title="Принять перемещение"
        okText="Принять"
        cancelText="Отмена"
        confirmLoading={receive.isPending}
        onCancel={() => setReceived(null)}
        onOk={() => receive.mutate()}
        width={640}
      >
        <Typography.Paragraph type="secondary">
          Впишите, сколько фактически пришло. Недостача спишется актом на складе-получателе
          с причиной «Недостача при приёме»; больше отправленного принять нельзя.
        </Typography.Paragraph>
        <Table<DocumentLineOut>
          rowKey="document_line_id"
          size="small"
          pagination={false}
          dataSource={doc.lines}
          columns={[
            { title: "Продукт", dataIndex: "product_id",
              render: (pid: number, row) => row.product_name ?? nameOf(products.byId, pid) },
            { title: "Отправлено", dataIndex: "quantity", align: "right", width: 120,
              render: (v: string) => fmtQty(v) },
            {
              title: "Принято",
              key: "received",
              width: 150,
              render: (_, row) => (
                <InputNumber
                  size="small"
                  min={0}
                  max={Number(row.quantity)}
                  value={received?.[row.document_line_id]}
                  onChange={(v) => setReceived((prev) => ({
                    ...(prev ?? {}), [row.document_line_id]: v ?? 0 }))}
                />
              ),
            },
          ]}
        />
        <Input.TextArea
          rows={2}
          style={{ marginTop: 12 }}
          placeholder="Комментарий (например: мешок порван)"
          value={receiptComment}
          onChange={(e) => setReceiptComment(e.target.value)}
        />
      </Modal>

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
