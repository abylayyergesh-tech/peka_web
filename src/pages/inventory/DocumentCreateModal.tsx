/** Create-document modal (opened from /documents). Wraps the shared form. */
import { App, Form, Modal } from "antd";
import dayjs from "dayjs";
import { useState } from "react";
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
import { useCompanyEntities } from "@/pages/finance/companyEntities";
import WriteOffCategoriesModal, {
  useWriteOffCategories,
} from "@/pages/inventory/WriteOffCategoriesModal";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}

export default function DocumentCreateModal({ open, onClose, onCreated }: Props) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<DocumentFormValues>();
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const products = useProductsLookup();
  const warehouses = useWarehousesLookup();
  const suppliers = useSuppliersLookup();
  const entities = useCompanyEntities();
  const writeOffCategories = useWriteOffCategories(true);

  const create = useMutation({
    mutationFn: (values: DocumentFormValues) =>
      createDocument(buildDocumentPayload(values, products.byId)),
    onSuccess: (doc) => {
      message.success("Документ создан");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["write-offs"] });
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
          companyEntityOptions={(entities.data ?? [])
            .filter((e) => e.is_active)
            .map((e) => ({ value: e.company_entity_id, label: e.name }))}
          form={form}
          mode="create"
          productOptions={products.options}
          warehouseOptions={warehouses.options}
          supplierOptions={suppliers.options}
          writeOffCategoryOptions={(writeOffCategories.data ?? []).map((c) => ({
            value: c.write_off_category_id,
            label: c.name,
          }))}
          onManageWriteOffCategories={() => setCategoriesOpen(true)}
        />
      </Form>
      <WriteOffCategoriesModal
        open={categoriesOpen}
        onClose={() => setCategoriesOpen(false)}
      />
    </Modal>
  );
}
