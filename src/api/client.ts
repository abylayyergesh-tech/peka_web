import { reportClientError } from "@/telemetry";
import { sessionEpoch, sessionSignal } from "@/session";
/** Axios instance + shared API types. Every module api file imports from here. */
import axios, { AxiosError, CanceledError } from "axios";

import { useAuthStore } from "@/auth/store";

/** Uniform backend error envelope: {code, message, details}. */
export interface ApiErrorBody {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

/** Uniform limit/offset page envelope (matches app.core.pagination.Page). */
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface PageParams {
  limit?: number;
  offset?: number;
}

/** Fetch EVERY page of a limit/offset endpoint and return the concatenated
 * items. The backend caps a page at 200 rows; single-page loaders left large
 * lists (1000+ products, 600+ suppliers) truncated, which surfaced as raw
 * "#<id>" instead of resolved names in recipe/PO/menu dropdowns. */
export async function fetchAllPages<T>(
  fetchPage: (p: { limit: number; offset: number }) => Promise<Page<T>>,
): Promise<T[]> {
  const PAGE = 200;
  const all: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await fetchPage({ limit: PAGE, offset });
    all.push(...page.items);
    if (page.items.length === 0 || all.length >= page.total) break;
  }
  return all;
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  timeout: 30_000,
});

/** Ссылка на файл, пригодная для `<img src>`.
 *
 * Бэкенд хранит фото ОТНОСИТЕЛЬНОЙ ссылкой («/media/menu/…»): абсолютный домен в
 * базе означал бы битые картинки после первого переезда API. Достроить её до
 * адреса своего API — задача каждого фронтенда, здесь это и делается. Внешние
 * ссылки (их можно вписать руками) отдаются как есть. */
export function mediaSrc(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  const base = (api.defaults.baseURL || "").replace(/\/$/, "");
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

type SessionConfig = { _sessionEpoch?: number; _retried?: boolean };
api.interceptors.request.use((config) => {
  (config as typeof config & SessionConfig)._sessionEpoch = sessionEpoch();
  config.signal ??= sessionSignal();
  const state = useAuthStore.getState();
  if (state.token) config.headers.Authorization = `Bearer ${state.token}`;
  if (state.activeOrgId != null) config.headers["X-Organization-Id"] = String(state.activeOrgId);
  return config;
});

let refreshInFlight: { epoch: number; promise: Promise<string | null> } | null = null;
async function tryRefresh(epoch: number): Promise<string | null> {
  const { refreshToken } = useAuthStore.getState();
  if (!refreshToken) return null;
  const rotate = async (): Promise<string | null> => {
    // Re-read after obtaining the cross-tab lock: another tab may have rotated.
    await useAuthStore.persist.rehydrate();
    if (sessionEpoch() !== epoch) throw new CanceledError("Session changed");
    if (useAuthStore.getState().refreshToken !== refreshToken)
      return useAuthStore.getState().token;
    try {
    const { data } = await axios.post<{ access_token: string; refresh_token: string | null }>(
      `${import.meta.env.VITE_API_URL || "/api"}/auth/refresh`,
      { refresh_token: refreshToken }, { timeout: 15_000, signal: sessionSignal() });
    if (sessionEpoch() !== epoch || useAuthStore.getState().refreshToken !== refreshToken)
      throw new CanceledError("Session changed");
    useAuthStore.getState().rotateTokens(data.access_token, data.refresh_token);
    return data.access_token;
  } catch (error) {
    // A temporary failure must not destroy a valid refresh token or the cart.
    if (axios.isAxiosError(error) && error.response?.status === 401) return null;
    throw error;
    }
  };
  // Secure-context Web Locks prevent two tabs consuming the same refresh token.
  if (typeof navigator !== "undefined" && navigator.locks)
    return navigator.locks.request("peka_web:refresh", rotate);
  return rotate();
}

api.interceptors.response.use((response) => {
  if ((response.config as typeof response.config & SessionConfig)._sessionEpoch !== sessionEpoch())
    throw new CanceledError("Session changed");
  return response;
}, async (error: AxiosError<ApiErrorBody>) => {
  if (error.code === "ERR_NETWORK" || error.code === "ECONNABORTED") reportClientError("network");
  if (error.response && error.response.status >= 500)
    reportClientError("server", error.response.status, error.response.headers["x-request-id"]);
  const cfg = error.config as (typeof error.config & SessionConfig) | undefined;
  if (!cfg) return Promise.reject(error);
  const epoch = cfg._sessionEpoch;
  if (epoch !== sessionEpoch()) throw new CanceledError("Session changed");
  if (error.response?.status === 401 && !(cfg.url ?? "").startsWith("/auth/")) {
    if (!cfg._retried) {
      if (!refreshInFlight || refreshInFlight.epoch !== epoch) {
        const flight = { epoch, promise: tryRefresh(epoch) };
        refreshInFlight = flight;
        void flight.promise.finally(() => {
          if (refreshInFlight === flight) refreshInFlight = null;
        }).catch(() => undefined);
      }
      const access = await refreshInFlight.promise;
      if (epoch !== sessionEpoch()) throw new CanceledError("Session changed");
      if (access) { cfg._retried = true; return api.request(cfg); }
    }
    useAuthStore.getState().logout();
  }
  return Promise.reject(error);
});

/** Понятные названия полей для сообщений о невалидном запросе. */
const FIELD_LABELS: Record<string, string> = {
  lines: "строка",
  quantity: "количество",
  price: "цена",
  unit_id: "единица измерения",
  product_id: "продукт",
  supplier_id: "поставщик",
  warehouse_id: "склад",
  doc_date: "дата документа",
  menu_item_id: "позиция меню",
  customer_id: "клиент",
  customer_address_id: "точка клиента",
  tax_id: "БИН/ИИН",
};

/** `["body","lines",3,"price"]` -> `строка 4 → цена`. */
function locLabel(loc: unknown): string {
  if (!Array.isArray(loc)) return "";
  const parts: string[] = [];
  for (let i = 0; i < loc.length; i += 1) {
    const seg = loc[i];
    if (seg === "body" || seg === "query" || seg === "path") continue;
    if (typeof seg === "number") {
      // Индекс относится к предыдущему сегменту: «строка» + номер (человеку — с 1).
      if (parts.length) parts[parts.length - 1] += ` ${seg + 1}`;
      continue;
    }
    parts.push(FIELD_LABELS[String(seg)] ?? String(seg));
  }
  return parts.join(" → ");
}

/** Расшифровать `details.errors` из Pydantic: без этого пользователь видит только
 *  «Request validation failed» и не знает, какое поле в какой строке виновато. */
function validationDetail(details: Record<string, unknown> | undefined): string | null {
  const errors = details?.["errors"];
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const shown = errors.slice(0, 3).map((err) => {
    const e = err as { loc?: unknown; msg?: unknown };
    const where = locLabel(e.loc);
    const msg = String(e.msg ?? "неверное значение").replace(/^Value error, /, "");
    return where ? `${where}: ${msg}` : msg;
  });
  const more = errors.length > shown.length ? ` и ещё ${errors.length - shown.length}` : "";
  return `${shown.join("; ")}${more}`;
}

/** Human-readable message from an API error (for antd message/notification). */
export function errorMessage(e: unknown): string {
  if (axios.isAxiosError<ApiErrorBody>(e)) {
    const body = e.response?.data;
    const detail = validationDetail(body?.details);
    if (detail) return `Проверьте поля — ${detail}`;
    if (body?.message) {
      const names = body.details?.["missing_product_names"];
      if (Array.isArray(names) && names.length > 0) {
        const shown = names.slice(0, 8).map(String).join(", ");
        const more = names.length > 8 ? " и др." : "";
        return `${body.message}${body.message.includes(":") ? "" : `: ${shown}${more}`}`;
      }
      return body.code ? `${body.message} (${body.code})` : body.message;
    }
    if (e.response?.status === 422) return "Проверьте правильность заполнения полей";
    if (e.code === "ERR_NETWORK") return "Сервер недоступен";
    return e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

/** Error code from the envelope, if any (for branching on business rules). */
export function errorCode(e: unknown): string | undefined {
  if (axios.isAxiosError<ApiErrorBody>(e)) return e.response?.data?.code;
  return undefined;
}
