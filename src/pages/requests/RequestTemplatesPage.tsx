/** /requests/templates — бланки заявлений в GCS (печать / скачивание). */
import { PlusOutlined, DownloadOutlined, PrinterOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Upload,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { UploadFile } from "antd/es/upload/interface";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  canPrintAttachment,
  downloadAttachment,
  fmtFileSize,
  printAttachment,
} from "@/api/attachments";
import {
  createRequestTemplate,
  deleteRequestTemplate,
  listRequestTemplates,
  type RequestTemplateOut,
} from "@/api/requestTemplates";
import type { RequestType } from "@/api/requests";
import { useCan } from "@/auth/store";
import { fmtDateTime } from "@/components/format";
import RequestsSectionTabs from "@/pages/requests/RequestsSectionTabs";
import { REQUEST_TYPE_LABELS, REQUEST_TYPE_OPTIONS } from "@/pages/requests/shared";

const TEMPLATES_KEY = ["request-templates"] as const;

interface UploadForm {
  title: string;
  request_type?: RequestType;
  file?: UploadFile[];
}

function pickedFile(list: UploadFile[] | undefined): File | undefined {
  return list?.[0]?.originFileObj;
}

export default function RequestTemplatesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("staff.manage");
  const [typeFilter, setTypeFilter] = useState<RequestType | undefined>();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<UploadForm>();

  const query = useQuery({
    queryKey: [...TEMPLATES_KEY, typeFilter ?? null],
    queryFn: () => listRequestTemplates(typeFilter),
  });

  const create = useMutation({
    mutationFn: (v: UploadForm) => {
      const file = pickedFile(v.file);
      if (!file) throw new Error("Выберите файл");
      return createRequestTemplate(file, {
        title: v.title,
        request_type: v.request_type,
      });
    },
    onSuccess: (row) => {
      message.success(`«${row.title}» загружен в хранилище`);
      setOpen(false);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: deleteRequestTemplate,
    onSuccess: () => {
      message.success("Бланк удалён");
      queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const columns: ColumnsType<RequestTemplateOut> = [
    {
      title: "Тип",
      dataIndex: "request_type",
      width: 180,
      render: (t: RequestType | null) =>
        t ? REQUEST_TYPE_LABELS[t] ?? t : "Общий бланк",
    },
    { title: "Название", dataIndex: "title" },
    {
      title: "Файл",
      key: "file",
      render: (_, row) =>
        row.file ? (
          <span className="row-card-meta">
            {row.file.file_name} · {fmtFileSize(row.file.size_bytes)}
          </span>
        ) : (
          "—"
        ),
    },
    {
      title: "Загружен",
      dataIndex: "created_at",
      width: 160,
      render: fmtDateTime,
    },
    {
      title: "",
      key: "actions",
      width: 260,
      render: (_, row) => {
        const file = row.file;
        return (
          <Space>
            {file && (
              <Button
                type="link"
                size="small"
                icon={<DownloadOutlined />}
                onClick={() =>
                  downloadAttachment(file).catch((e) => message.error(errorMessage(e)))
                }
              >
                Скачать
              </Button>
            )}
            {file && canPrintAttachment(file) && (
              <Button
                type="link"
                size="small"
                icon={<PrinterOutlined />}
                onClick={() =>
                  printAttachment(file).then((ok) => {
                    if (!ok) message.warning("Разрешите всплывающие окна для печати");
                  }).catch((e) => message.error(errorMessage(e)))
                }
              >
                Печать
              </Button>
            )}
            {canManage && (
              <Popconfirm
                title="Удалить бланк из хранилища?"
                okText="Удалить"
                cancelText="Отмена"
                onConfirm={() => remove.mutate(row.request_template_id)}
              >
                <a>Удалить</a>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <Space
        style={{ marginBottom: 12, justifyContent: "space-between", width: "100%" }}
        align="start"
      >
        <div>
          <p className="page-kicker">HR</p>
          <h1 className="page-title">Шаблоны заявлений</h1>
          <p className="page-lead">
            Печатные бланки лежат в облаке. Скачайте или распечатайте PDF —
            Word браузер сам не напечатает, его нужно скачать.
          </p>
        </div>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            Загрузить бланк
          </Button>
        )}
      </Space>
      <RequestsSectionTabs active="templates" />
      <Space style={{ marginBottom: 16 }}>
        <Select
          allowClear
          placeholder="Тип заявления"
          style={{ width: 220 }}
          options={REQUEST_TYPE_OPTIONS}
          value={typeFilter}
          onChange={setTypeFilter}
        />
      </Space>
      <Table<RequestTemplateOut>
        rowKey="request_template_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data}
        columns={columns}
        pagination={false}
        locale={{ emptyText: "Бланков пока нет" }}
      />

      <Modal
        title="Загрузить бланк"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        okText="Загрузить"
        cancelText="Отмена"
        confirmLoading={create.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => create.mutate(v)}>
          <Form.Item
            name="title"
            label="Название"
            rules={[{ required: true, message: "Как бланк называется в списке" }]}
          >
            <Input placeholder="Заявление на отпуск" maxLength={256} />
          </Form.Item>
          <Form.Item name="request_type" label="Тип заявления">
            <Select
              allowClear
              placeholder="Общий бланк"
              options={REQUEST_TYPE_OPTIONS}
            />
          </Form.Item>
          <Form.Item
            name="file"
            label="Файл"
            valuePropName="fileList"
            getValueFromEvent={(e: { fileList?: UploadFile[] } | UploadFile[]) =>
              Array.isArray(e) ? e : (e?.fileList ?? [])
            }
            rules={[{ required: true, type: "array", min: 1, message: "Выберите файл" }]}
          >
            <Upload
              maxCount={1}
              beforeUpload={() => false}
              accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.webp"
            >
              <Button>Выбрать файл</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
