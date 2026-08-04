/** Объявления цеха — лента на «Главной» клиентского сайта (peka_clients_web).
 * DTO повторяют app/announcements/schemas.py 1:1. */
import { api } from "@/api/client";
import type { Page, PageParams } from "@/api/client";

export interface AnnouncementOut {
  announcement_id: number;
  organization_id: number;
  title: string;
  body: string | null;
  image_url: string | null;
  /** Позиция меню, к которой ведёт кнопка «Заказать» в ленте; null — просто текст. */
  menu_item_id: number | null;
  is_active: boolean;
  /** Меньше — выше в ленте; при равенстве побеждает более свежее. */
  display_order: number;
  created_at: string;
  updated_at: string | null;
}

export interface AnnouncementCreate {
  title: string;
  body?: string | null;
  image_url?: string | null;
  menu_item_id?: number | null;
  is_active?: boolean;
  display_order?: number;
}

export type AnnouncementUpdate = Partial<AnnouncementCreate>;

export interface AnnouncementListParams extends PageParams {
  active?: boolean;
}

export async function listAnnouncements(
  params: AnnouncementListParams,
): Promise<Page<AnnouncementOut>> {
  const { data } = await api.get<Page<AnnouncementOut>>("/announcements", { params });
  return data;
}

export async function createAnnouncement(body: AnnouncementCreate): Promise<AnnouncementOut> {
  const { data } = await api.post<AnnouncementOut>("/announcements", body);
  return data;
}

export async function updateAnnouncement(
  id: number,
  body: AnnouncementUpdate,
): Promise<AnnouncementOut> {
  const { data } = await api.patch<AnnouncementOut>(`/announcements/${id}`, body);
  return data;
}

/** Удаление настоящее: объявление ни на что не ссылается и истории не образует.
 *  Спрятать, не теряя текст, можно через `is_active`. */
export async function deleteAnnouncement(id: number): Promise<AnnouncementOut> {
  const { data } = await api.delete<AnnouncementOut>(`/announcements/${id}`);
  return data;
}
