/** «Абеке» (beta) — ИИ-ассистент с базой знаний (бэкенд: app/assistant). */
import { api } from "@/api/client";
import { useAuthStore } from "@/auth/store";

export interface AssistantStatus {
  configured: boolean;
  model: string;
  embed_model: string;
  supported_formats: string[];
  system_documents: number;
  organization_documents: number;
  chunks: number;
  embedded_chunks: number;
}

export interface AssistantChat {
  assistant_chat_id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface AssistantSource {
  n: number;
  document_id: number;
  title: string;
  heading: string | null;
  source: string;
  snippet: string;
}

export interface AssistantMessage {
  assistant_message_id: number;
  role: "user" | "assistant";
  content: string;
  sources: AssistantSource[];
  model: string | null;
  error: string | null;
  created_at: string;
}

export interface KbDocument {
  kb_document_id: number;
  title: string;
  source: "system" | "upload" | "settings";
  category: string | null;
  file_name: string | null;
  size_bytes: number | null;
  status: string;
  error: string | null;
  chunk_count: number;
  embedded: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export async function getAssistantStatus(): Promise<AssistantStatus> {
  const { data } = await api.get<AssistantStatus>("/assistant/status");
  return data;
}

export async function listChats(): Promise<AssistantChat[]> {
  const { data } = await api.get<AssistantChat[]>("/assistant/chats");
  return data;
}

export async function createChat(): Promise<AssistantChat> {
  const { data } = await api.post<AssistantChat>("/assistant/chats", {});
  return data;
}

export async function deleteChat(id: number): Promise<void> {
  await api.delete(`/assistant/chats/${id}`);
}

export async function listMessages(chatId: number): Promise<AssistantMessage[]> {
  const { data } = await api.get<AssistantMessage[]>(`/assistant/chats/${chatId}/messages`);
  return data;
}

export async function listKbDocuments(): Promise<KbDocument[]> {
  const { data } = await api.get<KbDocument[]>("/assistant/documents");
  return data;
}

export async function uploadKbDocument(file: File): Promise<KbDocument> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<KbDocument>("/assistant/documents", form, { timeout: 300_000 });
  return data;
}

export async function deleteKbDocument(id: number): Promise<void> {
  await api.delete(`/assistant/documents/${id}`);
}

export interface StreamHandlers {
  onSources?: (sources: AssistantSource[]) => void;
  onDelta: (text: string) => void;
  onError?: (message: string) => void;
  onDone?: (messageId: number) => void;
}

/** Отправить вопрос и читать ответ потоком (Server-Sent Events).
 *  Перед потоком — обычный запрос через axios: он при необходимости обновит
 *  токен, а `fetch` возьмёт уже свежий. */
export async function sendMessageStream(
  chatId: number,
  content: string,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  await api.get("/assistant/status");
  const { token, activeOrgId } = useAuthStore.getState();
  const base = (api.defaults.baseURL || "").replace(/\/$/, "");
  const resp = await fetch(`${base}/assistant/chats/${chatId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(activeOrgId != null ? { "X-Organization-Id": String(activeOrgId) } : {}),
    },
    body: JSON.stringify({ content }),
    signal,
  });
  if (!resp.ok || !resp.body) {
    let message = `Ошибка ${resp.status}`;
    try {
      const body = await resp.json();
      message = body.message ?? message;
    } catch {
      /* не JSON */
    }
    throw new Error(message);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = "message";
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (!data) continue;
      const payload = JSON.parse(data);
      if (event === "sources") handlers.onSources?.(payload);
      else if (event === "delta") handlers.onDelta(payload.text ?? "");
      else if (event === "error") handlers.onError?.(payload.message ?? "Ошибка модели");
      else if (event === "done") handlers.onDone?.(payload.assistant_message_id);
    }
  }
}
