/** Edit-draft modal (from /documents/:id). Reuses the shared form; the backend
 *  PATCH takes a full DocumentCreate body, so we resend the whole document.
 *  Only offered for non-receipt drafts — DocumentOut omits a receipt's
 *  supplier_id/internal/free_goods, so a receipt can't be reconstructed safely. */
import { App, Form, Modal } from "antd";
import dayjs from "dayjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import { updateDocument, type DocumentOut } from "@/api/inventory";
import {
  buildDocumentPayload,
  DocumentFormFields,
  type DocumentFormValues,
} from "@/pages/inventory/DocumentForm";
import {
  useProductsLookup,
  useSuppliersLookup,
  useWarehousesLookup,
} from "@/pages/inventory/shared";

interface Props {
  open: boolean;
  doc: DocumentOut;
  onClose: () => void;
  onSaved: () => void;
}

export default function DocumentEditModal({ open, doc, onClose, onSaved }: Props) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<DocumentFormValues>();

  const products = useProductsLookup();
  const warehouses = useWarehousesLookup();
  const suppliers = useSuppliersLookup();

  const update = useMutation({
    mutationFn: (values: DocumentFormValues) =>
      updateDocument(doc.id, buildDocumentPayload(values, products.byId)),
    onSuccess: () => {
      message.success("Сохранено");
      queryClient.invalidateQueries({ queryKey: ["document", doc.id] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      onSaved();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const initialValues: DocumentFormValues = {
    type: doc.type,
    doc_date: dayjs(doc.doc_date),
    warehouse_id: doc.warehouse_id,
    target_warehouse_id: doc.target_warehouse_id ?? undefined,
    counterparty: doc.counterparty ?? undefined,
    lines: doc.lines.map((l) => ({
      product_id: l.product_id,
      quantity: l.quantity,
      price: l.price ?? undefined,
      expected_quantity: l.expected_quantity ?? undefined,
      free_goods: false,
    })),
  };

  return (
    <Modal
      title={`Редактирование черновика №${doc.number ?? doc.id}`}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Сохранить"
      cancelText="Отмена"
      confirmLoading={update.isPending}
      width={780}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={initialValues}
        onFinish={(v) => update.mutate(v)}
      >
        <DocumentFormFields
          form={form}
          mode="edit"
          productOptions={products.options}
          warehouseOptions={warehouses.options}
          supplierOptions={suppliers.options}
        />
      </Form>
    </Modal>
  );
}
