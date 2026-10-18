/** Онбординг сотрудника и инструктажи по ТБ — app/onboarding/admin_router.py.
 *
 * Онбординг: тексты приложения (приветствие, согласие, карточки обзора),
 * запуск и кто прошёл. Инструктажи: аудитория, версии с блоками и тестом,
 * повторные, кто проходит и неизменяемый журнал с листами ознакомления. */
import { api, type Page, type PageParams } from "@/api/client";

export const ONBOARDING_STEP_LABELS: Record<string, string> = {
  welcome: "Приветствие",
  consent: "Согласие",
  overview: "Обзор",
  permissions: "Разрешения",
  photo: "Эталонное фото",
  briefing: "Инструктаж",
  confirm: "Подпись",
};

export const BLOCK_TOPIC_LABELS: Record<BlockTopic, string> = {
  labor: "Охрана труда",
  fire: "Пожарная безопасность",
  sanitary: "Санитария",
  other: "Другое",
};

export const MATERIAL_KIND_LABELS: Record<MaterialKind, string> = {
  text: "Текст",
  image: "Картинка",
  video: "Видео",
  pdf: "PDF",
};

export const ASSIGNMENT_REASON_LABELS: Record<string, string> = {
  initial: "первичный",
  repeat: "повторный",
  new_version: "новая версия",
};

export const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  assigned: "назначен",
  in_progress: "проходит",
  passed: "ждёт подписи",
  confirmed: "подписан",
};

// ---- онбординг ---------------------------------------------------------------
export interface OnboardingCard {
  onboarding_card_id?: number;
  title_ru: string;
  title_kk: string | null;
  text_ru: string | null;
  text_kk: string | null;
  image_url: string | null;
}

export interface OnboardingSettings {
  launched_at: string | null;
  welcome_title_ru: string | null;
  welcome_title_kk: string | null;
  welcome_text_ru: string | null;
  welcome_text_kk: string | null;
  welcome_video_url: string | null;
  consent_version: string;
  consent_text_ru: string | null;
  consent_text_kk: string | null;
  cards: OnboardingCard[];
  grace_days: number;
  default_welcome_title: string;
  default_welcome_text: string;
  default_consent_text: string;
}

export type OnboardingSettingsIn = Omit<
  OnboardingSettings,
  | "launched_at"
  | "consent_version"
  | "grace_days"
  | "default_welcome_title"
  | "default_welcome_text"
  | "default_consent_text"
>;

export interface EmployeeOnboarding {
  employee_id: number;
  full_name: string;
  department_name: string | null;
  position: string | null;
  status: "not_launched" | "not_started" | "in_progress" | "completed";
  current_step: string | null;
  completed_at: string | null;
  grace_until: string | null;
  consent_version: string | null;
  consent_accepted_at: string | null;
  reference_photo_url: string | null;
  open_briefings: number;
  clock_allowed: boolean;
  reset_at: string | null;
}

export async function getOnboardingSettings(): Promise<OnboardingSettings> {
  const { data } = await api.get<OnboardingSettings>("/onboarding/settings");
  return data;
}

export async function saveOnboardingSettings(body: OnboardingSettingsIn): Promise<OnboardingSettings> {
  const { data } = await api.put<OnboardingSettings>("/onboarding/settings", body);
  return data;
}

export async function launchOnboarding(): Promise<OnboardingSettings> {
  const { data } = await api.post<OnboardingSettings>("/onboarding/launch");
  return data;
}

export async function stopOnboarding(): Promise<OnboardingSettings> {
  const { data } = await api.post<OnboardingSettings>("/onboarding/stop");
  return data;
}

export async function listOnboardingEmployees(
  params: PageParams & { status?: "pending" | "completed"; department_id?: number; q?: string },
): Promise<Page<EmployeeOnboarding>> {
  const { data } = await api.get<Page<EmployeeOnboarding>>("/onboarding/employees", { params });
  return data;
}

export async function getEmployeeOnboarding(employeeId: number): Promise<EmployeeOnboarding> {
  const { data } = await api.get<EmployeeOnboarding>(`/employees/${employeeId}/onboarding`);
  return data;
}

export async function resetEmployeeOnboarding(employeeId: number): Promise<EmployeeOnboarding> {
  const { data } = await api.post<EmployeeOnboarding>(`/employees/${employeeId}/onboarding/reset`);
  return data;
}

// ---- инструктажи -------------------------------------------------------------
export type BlockTopic = "labor" | "fire" | "sanitary" | "other";
export type MaterialKind = "text" | "image" | "video" | "pdf";

export interface BriefingVersionSummary {
  version_id: number;
  number: number;
  published_at: string | null;
  archived_at: string | null;
  pass_percent: number;
  repeat_days: number | null;
  blocks_count: number;
}

export interface Briefing {
  briefing_id: number;
  title: string;
  topic: string | null;
  is_active: boolean;
  department_ids: number[];
  position_ids: number[];
  departments: { id: number; name: string }[];
  positions: { id: number; name: string }[];
  current_version: BriefingVersionSummary | null;
  draft_version_id: number | null;
  open_count: number;
  confirmed_count: number;
  overdue_count: number;
}

export interface BriefingDetail extends Briefing {
  versions: BriefingVersionSummary[];
}

export interface BriefingOption {
  option_id?: number;
  text_ru: string;
  text_kk: string | null;
  is_correct: boolean;
}

export interface BriefingQuestion {
  question_id?: number;
  text_ru: string;
  text_kk: string | null;
  multiple: boolean;
  options: BriefingOption[];
}

export interface BriefingMaterial {
  material_id?: number;
  kind: MaterialKind;
  title_ru: string | null;
  title_kk: string | null;
  text_ru: string | null;
  text_kk: string | null;
  url: string | null;
  attachment_id: number | null;
  file_name?: string | null;
  file_url?: string | null;
}

export interface BriefingBlock {
  block_id?: number;
  title_ru: string;
  title_kk: string | null;
  topic: BlockTopic;
  materials: BriefingMaterial[];
  questions: BriefingQuestion[];
}

export interface BriefingVersion extends BriefingVersionSummary {
  briefing_id: number;
  briefing_title: string;
  blocks: BriefingBlock[];
}

export interface BriefingAssignment {
  assignment_id: number;
  employee_id: number;
  employee_name: string;
  department_name: string | null;
  position: string | null;
  briefing_id: number;
  briefing_title: string;
  version_number: number;
  reason: string;
  status: string;
  assigned_at: string;
  due_date: string | null;
  overdue: boolean;
  blocks_total: number;
  blocks_passed: number;
  failed_streak: number;
  confirmed_at: string | null;
  sheet_pdf_url: string | null;
}

export interface JournalEntry {
  journal_id: number;
  employee_id: number;
  employee_name: string;
  position_name: string | null;
  department_name: string | null;
  briefing_id: number;
  briefing_title: string;
  version_number: number;
  reason: string;
  block_scores: { block_id: number; title: string; score_percent: number | null }[];
  sign_method: string;
  device_id: string | null;
  confirmed_at: string;
  sheet_pdf_url: string | null;
}

export async function listBriefings(includeInactive = false): Promise<Briefing[]> {
  const { data } = await api.get<Briefing[]>("/briefings", {
    params: { include_inactive: includeInactive || undefined },
  });
  return data;
}

export async function createBriefing(body: {
  title: string;
  topic?: string | null;
  department_ids: number[];
  position_ids: number[];
}): Promise<BriefingDetail> {
  const { data } = await api.post<BriefingDetail>("/briefings", body);
  return data;
}

export async function getBriefing(id: number): Promise<BriefingDetail> {
  const { data } = await api.get<BriefingDetail>(`/briefings/${id}`);
  return data;
}

export async function updateBriefing(
  id: number,
  body: Partial<{ title: string; topic: string | null; is_active: boolean; department_ids: number[]; position_ids: number[] }>,
): Promise<BriefingDetail> {
  const { data } = await api.patch<BriefingDetail>(`/briefings/${id}`, body);
  return data;
}

export async function newBriefingVersion(id: number): Promise<BriefingVersion> {
  const { data } = await api.post<BriefingVersion>(`/briefings/${id}/versions`);
  return data;
}

export async function getBriefingVersion(versionId: number): Promise<BriefingVersion> {
  const { data } = await api.get<BriefingVersion>(`/briefing-versions/${versionId}`);
  return data;
}

export async function saveBriefingVersion(
  versionId: number,
  body: { pass_percent: number; repeat_days: number | null; blocks: BriefingBlock[] },
): Promise<BriefingVersion> {
  const { data } = await api.put<BriefingVersion>(`/briefing-versions/${versionId}`, body);
  return data;
}

export async function deleteBriefingVersion(versionId: number): Promise<void> {
  await api.delete(`/briefing-versions/${versionId}`);
}

export async function publishBriefingVersion(versionId: number): Promise<BriefingDetail> {
  const { data } = await api.post<BriefingDetail>(`/briefing-versions/${versionId}/publish`);
  return data;
}

export async function uploadBriefingFile(
  versionId: number,
  file: File,
): Promise<{ attachment_id: number; file_name: string; content_type: string; url: string }> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post(`/briefing-versions/${versionId}/files`, form);
  return data;
}

export async function repeatBriefing(id: number, employeeIds?: number[]): Promise<{ assigned: number }> {
  const { data } = await api.post<{ assigned: number }>(`/briefings/${id}/repeat`, {
    employee_ids: employeeIds ?? null,
  });
  return data;
}

export type AssignmentFilter = "open" | "overdue" | "failing" | "confirmed" | "all";

export async function listBriefingAssignments(
  params: PageParams & {
    status?: AssignmentFilter;
    briefing_id?: number;
    department_id?: number;
    employee_id?: number;
  },
): Promise<Page<BriefingAssignment>> {
  const { data } = await api.get<Page<BriefingAssignment>>("/briefing-assignments", { params });
  return data;
}

export async function listEmployeeBriefings(employeeId: number): Promise<BriefingAssignment[]> {
  const { data } = await api.get<BriefingAssignment[]>(`/employees/${employeeId}/briefings`);
  return data;
}

export interface JournalParams extends PageParams {
  from?: string;
  to?: string;
  briefing_id?: number;
  employee_id?: number;
  q?: string;
}

export async function listBriefingJournal(params: JournalParams): Promise<Page<JournalEntry>> {
  const { data } = await api.get<Page<JournalEntry>>("/briefing-journal", { params });
  return data;
}

export async function downloadBriefingJournal(
  params: Omit<JournalParams, "limit" | "offset">,
): Promise<void> {
  const { data } = await api.get<Blob>("/briefing-journal/export.xlsx", {
    params,
    responseType: "blob",
  });
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = params.from && params.to
    ? `zhurnal_instruktazhey_${params.from}_${params.to}.xlsx`
    : "zhurnal_instruktazhey.xlsx";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
