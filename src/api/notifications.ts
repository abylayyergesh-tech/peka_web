/** Push-уведомления приложения сотрудника (BACKEND_TASKS.md §17): состояние для кабинета. */
import { api } from "@/api/client";

export interface PushStatus {
  /** Задан ли на сервере ключ проекта Firebase. Нет — push не уходят. */
  configured: boolean;
  project_id: string | null;
  /** Телефоны участников организации, с которых пришёл push-токен. */
  devices: number;
  /** В очереди и ещё не отправлено. */
  pending: number;
  sent_24h: number;
  /** Закрыто без доставки за сутки: нет токена, устарело, ошибка FCM. */
  undelivered_24h: number;
}

export async function getPushStatus(): Promise<PushStatus> {
  const { data } = await api.get<PushStatus>("/notifications/push-status");
  return data;
}
