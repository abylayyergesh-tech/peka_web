/** Список приложенных файлов с загрузкой, скачиванием и удалением.
 *
 * Один компонент на три раздела — личные дела сотрудников, фото накладных и
 * файлы выписок: действия у них одинаковые, отличается только владелец и
 * подписи. Разводить три почти одинаковых списка значило бы трижды чинить одну
 * и ту же мелочь.
 *
 * Название спрашивается ПРИ загрузке, а не после: «IMG_2841.jpg» в списке
 * личного дела бесполезен, а дописать подпись потом никто не возвращается.
 * Пустое поле допустимо — тогда подписью станет имя файла (так решает бэкенд).
 */
import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  FileOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  InboxOutlined,
} from "@ant-design/icons";
import { App, Button, Empty, Input, List, Popconfirm, Space, Spin, Tooltip, Typography, Upload } from "antd";
import type { UploadFile } from "antd/es/upload/interface";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  deleteAttachment,
  downloadAttachment,
  fmtFileSize,
  isImage,
  listAttachments,
  openAttachment,
  renameAttachment,
  uploadAttachment,
  type AttachmentOut,
  type AttachmentOwner,
} from "@/api/attachments";
import { fmtDateTime } from "@/components/format";

/** Ключ кэша списка — по владельцу: у каждого сотрудника своё дело. */
export function attachmentsKey(owner: AttachmentOwner) {
  return ["attachments", owner.kind, Object.values(owner).join(":")] as const;
}

function icon(item: AttachmentOut) {
  if (isImage(item)) return <FileImageOutlined />;
  if (item.content_type === "application/pdf") return <FilePdfOutlined />;
  return <FileOutlined />;
}

export default function AttachmentsPanel({
  owner,
  canManage = true,
  emptyText = "Файлов пока нет",
  uploadHint = "Перетащите файл сюда или нажмите",
}: {
  owner: AttachmentOwner;
  /** false — только просмотр и скачивание (нет права загружать). */
  canManage?: boolean;
  emptyText?: string;
  uploadHint?: string;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const key = attachmentsKey(owner);
  const [title, setTitle] = useState("");
  const [renaming, setRenaming] = useState<AttachmentOut | null>(null);
  const [renameTo, setRenameTo] = useState("");

  const files = useQuery({
    queryKey: key,
    queryFn: () => listAttachments(owner),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const upload = useMutation({
    mutationFn: (file: File) => uploadAttachment(owner, file, title),
    onSuccess: (item) => {
      message.success(`«${item.title}» загружен`);
      setTitle("");
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const rename = useMutation({
    mutationFn: ({ id, value }: { id: number; value: string }) => renameAttachment(id, value),
    onSuccess: () => {
      setRenaming(null);
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteAttachment(id),
    onSuccess: () => {
      message.success("Файл удалён");
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const save = useMutation({
    mutationFn: (item: AttachmentOut) => downloadAttachment(item),
    onError: (e) => message.error(errorMessage(e)),
  });

  const view = useMutation({
    mutationFn: (item: AttachmentOut) => openAttachment(item),
    onSuccess: (opened) => {
      if (!opened) message.warning("Браузер заблокировал вкладку — разрешите всплывающие окна");
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      {canManage && (
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          <Input
            placeholder="Название документа (необязательно)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            allowClear
          />
          <Upload.Dragger
            multiple={false}
            showUploadList={false}
            disabled={upload.isPending}
            // Загружаем сами: у ручки свои заголовки (токен, организация),
            // и ответ нужен целиком — antd этого не умеет.
            beforeUpload={(file) => {
              upload.mutate(file as unknown as File);
              return Upload.LIST_IGNORE;
            }}
            fileList={[] as UploadFile[]}
          >
            <p className="ant-upload-drag-icon" style={{ marginBottom: 4 }}>
              {upload.isPending ? <Spin /> : <InboxOutlined />}
            </p>
            <p className="ant-upload-text" style={{ fontSize: 14 }}>
              {upload.isPending ? "Загружаем…" : uploadHint}
            </p>
          </Upload.Dragger>
        </Space>
      )}

      {files.isPending ? (
        <div style={{ textAlign: "center", padding: 24 }}>
          <Spin />
        </div>
      ) : (files.data ?? []).length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />
      ) : (
        <List
          size="small"
          bordered
          dataSource={files.data}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Tooltip key="view" title="Открыть">
                  <Button
                    type="text"
                    icon={<EyeOutlined />}
                    loading={view.isPending && view.variables?.attachment_id === item.attachment_id}
                    onClick={() => view.mutate(item)}
                  />
                </Tooltip>,
                <Tooltip key="save" title="Скачать">
                  <Button
                    type="text"
                    icon={<DownloadOutlined />}
                    loading={save.isPending && save.variables?.attachment_id === item.attachment_id}
                    onClick={() => save.mutate(item)}
                  />
                </Tooltip>,
                ...(canManage
                  ? [
                      <Tooltip key="rename" title="Переименовать">
                        <Button
                          type="text"
                          icon={<EditOutlined />}
                          onClick={() => {
                            setRenaming(item);
                            setRenameTo(item.title);
                          }}
                        />
                      </Tooltip>,
                      <Popconfirm
                        key="del"
                        title="Удалить файл?"
                        description="Он исчезнет и из хранилища."
                        okText="Удалить"
                        cancelText="Отмена"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => remove.mutate(item.attachment_id)}
                      >
                        <Button type="text" danger icon={<DeleteOutlined />} />
                      </Popconfirm>,
                    ]
                  : []),
              ]}
            >
              <List.Item.Meta
                avatar={icon(item)}
                title={
                  renaming?.attachment_id === item.attachment_id ? (
                    <Input
                      autoFocus
                      size="small"
                      value={renameTo}
                      onChange={(e) => setRenameTo(e.target.value)}
                      onPressEnter={() =>
                        renameTo.trim() &&
                        rename.mutate({ id: item.attachment_id, value: renameTo.trim() })
                      }
                      onBlur={() => setRenaming(null)}
                      style={{ maxWidth: 320 }}
                    />
                  ) : (
                    item.title
                  )
                }
                description={
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {item.file_name} · {fmtFileSize(item.size_bytes)} ·{" "}
                    {fmtDateTime(item.created_at)}
                  </Typography.Text>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Space>
  );
}
