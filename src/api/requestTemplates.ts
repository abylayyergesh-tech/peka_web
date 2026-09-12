/** Бланки заявлений: карточка + файл в GCS. */
import { api } from "@/api/client";
import type { AttachmentOut } from "@/api/attachments";
import type { RequestType } from "@/api/requests";

export interface RequestTemplateOut {
  request_template_id: number;
  organization_id: number;
  request_type: RequestType | null;
  title: string;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  file: AttachmentOut | null;
}

export async function listRequestTemplates(
  requestType?: RequestType,
): Promise<RequestTemplateOut[]> {
  const { data } = await api.get<RequestTemplateOut[]>("/request-templates", {
    params: requestType ? { request_type: requestType } : undefined,
  });
  return data;
}

export async function createRequestTemplate(
  file: File,
  body: { title?: string; request_type?: RequestType | "" },
): Promise<RequestTemplateOut> {
  const fd = new FormData();
  fd.append("file", file);
  if (body.title?.trim()) fd.append("title", body.title.trim());
  if (body.request_type) fd.append("request_type", body.request_type);
  const { data } = await api.post<RequestTemplateOut>("/request-templates", fd, {
    timeout: 300_000,
  });
  return data;
}

export async function updateRequestTemplate(
  id: number,
  body: { title?: string; request_type?: RequestType | "" },
): Promise<RequestTemplateOut> {
  const { data } = await api.patch<RequestTemplateOut>(`/request-templates/${id}`, body);
  return data;
}

export async function replaceRequestTemplateFile(
  id: number,
  file: File,
): Promise<RequestTemplateOut> {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post<RequestTemplateOut>(
    `/request-templates/${id}/file`,
    fd,
    { timeout: 300_000 },
  );
  return data;
}

export async function deleteRequestTemplate(id: number): Promise<void> {
  await api.delete(`/request-templates/${id}`);
}