/** Русские подписи прав, заголовки групп и названий встроенных ролей.
 * Ключи прав — из app/core/capabilities.py (CAPABILITY_DESCRIPTIONS);
 * fallback — английское описание, приходящее с GET /capabilities. */
import type { CapabilityOut } from "@/api/admin";

const CAPABILITY_LABELS_RU: Record<string, string> = {
  "supplier.manage": "Создание и изменение поставщиков",
  "price.manage": "Управление прайс-листами поставщиков",
  "purchase_order.manage": "Создание и ведение заказов поставщикам",
  "payment.manage": "Регистрация и отмена платежей поставщикам",
  "receipt.post": "Создание и проведение приёмок товара",
  "menu.manage": "Управление меню продаж",
  "customer.manage": "Создание и изменение покупателей",
  "customer_payment.manage": "Регистрация и отмена платежей покупателей",
  "sale.operate": "Работа за кассой (смены, чеки, списания)",
  "finance.read": "Просмотр финансовых отчётов",
  "finance.manage": "Управление расходами и учётными периодами",
  "report.read": "Просмотр отчётов",
  "role.manage": "Управление ролями и индивидуальными правами",
  "member.manage": "Добавление и удаление участников, смена их роли",
  "catalog.manage": "Управление единицами измерения и товарами",
  "recipe.manage": "Управление рецептами",
  "inventory.manage": "Управление складами и складскими документами",
  "staff.manage": "Управление сотрудниками и отделами",
  "attendance.manage": "Управление точками работы и корректировка смен",
  "request.approve": "Просмотр всех заявлений, их согласование и отклонение",
  "request.policy.manage": "Управление порогами согласования заявлений",
};

/** Русская подпись права; fallback — description с бэкенда. */
export function capLabel(cap: CapabilityOut): string {
  return CAPABILITY_LABELS_RU[cap.key] ?? cap.description;
}

/** Заголовки групп прав — по префиксу ключа до первой точки. */
const GROUP_TITLES_RU: Record<string, string> = {
  supplier: "Поставщики",
  price: "Прайс-листы",
  purchase_order: "Заказы поставщикам",
  payment: "Платежи поставщикам",
  receipt: "Приёмки",
  menu: "Меню",
  customer: "Покупатели",
  customer_payment: "Платежи покупателей",
  sale: "Продажи",
  finance: "Финансы",
  report: "Отчёты",
  role: "Роли и права",
  member: "Участники",
  catalog: "Каталог",
  recipe: "Рецепты",
  inventory: "Склад",
  staff: "Персонал",
  attendance: "Посещаемость",
  request: "Заявления",
};

export function groupTitle(prefix: string): string {
  return GROUP_TITLES_RU[prefix] ?? prefix;
}

/** Группировка прав по префиксу до точки, порядок реестра сохранён. */
export function groupByPrefix(caps: CapabilityOut[]): [string, CapabilityOut[]][] {
  const map = new Map<string, CapabilityOut[]>();
  for (const cap of caps) {
    const prefix = cap.key.split(".")[0] ?? cap.key;
    const list = map.get(prefix);
    if (list) list.push(cap);
    else map.set(prefix, [cap]);
  }
  return Array.from(map.entries());
}

/** Русские названия встроенных ролей; кастомные — как есть. */
const ROLE_LABELS_RU: Record<string, string> = {
  owner: "Владелец",
  manager: "Менеджер",
  employee: "Сотрудник",
  "hr-admin": "HR-администратор",
};

export function roleLabel(name: string): string {
  return ROLE_LABELS_RU[name] ?? name;
}
