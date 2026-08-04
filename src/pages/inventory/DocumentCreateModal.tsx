/** Create-document modal (opened from /documents). Wraps the shared form. */
import { App, Form, Modal } from "antd";
import dayjs from "dayjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import { createDocument } from "@/api/inventory";
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
  onClose: () => void;
  onCreated: (id: number) => void;
}

export default function DocumentCreateModal({ open, onClose, onCreated }: Props) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<DocumentFormValues>();

  const products = useProductsLookup();
  const warehouses = useWarehousesLookup();
  const suppliers = useSuppliersLookup();

  const create = useMutation({
    mutationFn: (values: DocumentFormValues) =>
      createDocument(buildDocumentPayload(values, products.byId)),
    onSuccess: (doc) => {
      message.success("Документ создан");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      onCreated(doc.document_id);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <Modal
      title="Новый документ"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Создать"
      cancelText="Отмена"
      confirmLoading={create.isPending}
      width={780}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={{ doc_date: dayjs(), lines: [{}] }}
        onFinish={(v) => create.mutate(v)}
      >
        <DocumentFormFields
          form={form}
          mode="create"
          productOptions={products.options}
          warehouseOptions={warehouses.options}
          supplierOptions={suppliers.options}
        />
      </Form>
    </Modal>
  );
}
