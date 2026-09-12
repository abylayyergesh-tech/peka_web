/** Вложения: файлы, приложенные к сотруднику, документу или выписке.
 *
 * Три раздела — личные дела (`personnel`), фото накладных (`invoice`) и файлы
 * выписок (`statement`). На бэкенде это одна таблица и одни и те же действия
 * (app/attachments), поэтому и здесь один модуль, а не три копии.
 *
 * **Скачивание идёт через axios, а не ссылкой.** У `/attachments/{id}/download`
 * есть авторизация (в отличие от `/media/…`, откуда фото меню отдаётся кому
 * угодно): личное дело так открывать нельзя. Обычный `<a href>` не пошлёт ни
 * `Authorization`, ни `X-Organization-Id`, поэтому файл тянется запросом и
 * отдаётся браузеру как blob — тем же приёмом, что и выгрузка ведомости.
 */
import { api } from "@/api/client";

export type AttachmentKind =
  | "personnel"
  | "invoice"
  | "statement"
  | "recipe"
  | "medical_book"
  | "request_template";

export interface AttachmentOut {
  attachment_id: number;
  organization_id: number;
  kind: AttachmentKind;
  owner_id: number;
  /** Название документа, которое дал человек («Трудовой договор»). */
  title: string;
  /** Имя файла при загрузке — с ним же он и скачается. */
  file_name: string;
  content_type: string;
  size_bytes: number;
  uploaded_by: number | null;
  created_at: string;
  download_url: string;
}

/** Владелец вложений: раздел определяется тем, к чему они приложены. */
export type AttachmentOwner =
  | { kind: "personnel"; employeeId: number }
  | { kind: "invoice"; documentId: number }
  | { kind: "statement"; statementId: number }
  | { kind: "recipe"; recipeId: number }
  | { kind: "medical_book"; employeeId: number; bookId: number };

function ownerPath(owner: AttachmentOwner): string {
  switch (owner.kind) {
    case "personnel":
      return `/employees/${owner.employeeId}/files`;
    case "invoice":
      return `/documents/${owner.documentId}/photos`;
    case "statement":
      return `/bank-statements/${owner.statementId}/files`;
    case "recipe":
      return `/recipes/${owner.recipeId}/files`;
    case "medical_book":
      return `/employees/${owner.employeeId}/medical-books/${owner.bookId}/files`;
  }
}

export async function listAttachments(owner: AttachmentOwner): Promise<AttachmentOut[]> {
  const { data } = await api.get<AttachmentOut[]>(ownerPath(owner));
  return data;
}

/** Загрузить файл. `title` пустой — подписью станет имя файла (так решает бэкенд). */
export async function uploadAttachment(
  owner: AttachmentOwner,
  file: File,
  title?: string,
): Promise<AttachmentOut> {
  const fd = new FormData();
  fd.append("file", file);
  if (title?.trim()) fd.append("title", title.trim());
  const { data } = await api.post<AttachmentOut>(ownerPath(owner), fd, {
    // Скан договора с телефона — это десятки мегабайт на неспешном канале.
    timeout: 300_000,
  });
  return data;
}

export async function renameAttachment(
  attachmentId: number,
  title: string,
): Promise<AttachmentOut> {
  const { data } = await api.patch<AttachmentOut>(`/attachments/${attachmentId}`, { title });
  return data;
}

export async function deleteAttachment(attachmentId: number): Promise<void> {
  await api.delete(`/attachments/${attachmentId}`);
}

/** Скачать файл и отдать его браузеру под исходным именем. */
export async function downloadAttachment(item: AttachmentOut): Promise<void> {
  const { data } = await api.get<Blob>(item.download_url, { responseType: "blob" });
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = item.file_name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Показать файл, не скачивая: открывает blob в новой вкладке.
 *
 * Для фото накладной это основной сценарий — её открывают посмотреть, а не
 * сохранить. Возвращает false, если вкладку зарезал блокировщик. */
export async function openAttachment(item: AttachmentOut): Promise<boolean> {
  const { data } = await api.get<Blob>(item.download_url, { responseType: "blob" });
  const url = URL.createObjectURL(data);
  const win = window.open(url, "_blank");
  if (!win) {
    URL.revokeObjectURL(url);
    return false;
  }
  // Ссылку держим до закрытия вкладки: отозвать её сразу — показать пустую страницу.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

/** «1,4 МБ» — размер файла человеку. */
export function fmtFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} КБ`;
  return `${(kb / 1024).toFixed(1)} МБ`;
}

/** Картинку можно показать превью, остальное — только скачать. */
export function isImage(item: AttachmentOut): boolean {
  return item.content_type.startsWith("image/");
}

export function canPrintAttachment(item: AttachmentOut): boolean {
  return isImage(item) || item.content_type === "application/pdf";
}

/** Открыть и послать на печать. Word/Excel браузер не печатает — их скачивают. */
export async function printAttachment(item: AttachmentOut): Promise<boolean> {
  const { data } = await api.get<Blob>(item.download_url, { responseType: "blob" });
  const url = URL.createObjectURL(data);
  const win = window.open(url, "_blank");
  if (!win) {
    URL.revokeObjectURL(url);
    return false;
  }
  const kick = () => {
    try {
      win.focus();
      win.print();
    } catch {
      /* пусто: вкладка открыта, человек нажмёт Ctrl+P сам */
    }
  };
  win.addEventListener("load", kick);
  window.setTimeout(kick, 700);
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
