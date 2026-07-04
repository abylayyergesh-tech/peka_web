/** Single source of truth for navigation: path, RU label, required capability.
 * Items without `cap` are visible to every member of the active org.
 * Module route files must register pages at exactly these paths. */

export interface NavItem {
  path: string;
  label: string;
  cap?: string;
}

export interface NavSection {
  key: string;
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    key: "catalog",
    label: "Каталог",
    items: [
      { path: "/products", label: "Продукты" },
      { path: "/units", label: "Единицы измерения" },
      { path: "/recipes", label: "Тех-карты" },
    ],
  },
  {
    key: "inventory",
    label: "Склад",
    items: [
      { path: "/warehouses", label: "Склады" },
      { path: "/documents", label: "Документы" },
    ],
  },
  {
    key: "procurement",
    label: "Закупки",
    items: [
      { path: "/suppliers", label: "Поставщики" },
      { path: "/purchase-orders", label: "Заказы поставщикам" },
    ],
  },
  {
    key: "sales",
    label: "Продажи",
    items: [
      { path: "/menu-items", label: "Меню" },
      { path: "/shifts", label: "Смены (касса)", cap: "sale.operate" },
      { path: "/checks", label: "Чеки", cap: "sale.operate" },
      { path: "/customers", label: "Клиенты" },
    ],
  },
  {
    key: "finance",
    label: "Финансы",
    items: [
      { path: "/expenses", label: "Расходы", cap: "finance.read" },
      { path: "/expense-categories", label: "Статьи расходов", cap: "finance.read" },
      { path: "/accounting-periods", label: "Учётные периоды", cap: "finance.read" },
    ],
  },
  {
    key: "reports",
    label: "Отчёты",
    items: [
      { path: "/reports/stock", label: "Остатки" },
      { path: "/reports/movements", label: "Движения" },
      { path: "/reports/product-cost", label: "Себестоимость" },
      { path: "/reports/sales", label: "Продажи", cap: "report.read" },
      { path: "/reports/receivables", label: "Дебиторка", cap: "report.read" },
      { path: "/reports/payables", label: "Кредиторка", cap: "report.read" },
      { path: "/reports/pnl", label: "P&L", cap: "finance.read" },
      { path: "/reports/financial-summary", label: "Финансовая сводка", cap: "finance.read" },
    ],
  },
  {
    key: "staff",
    label: "Персонал",
    items: [
      { path: "/employees", label: "Сотрудники", cap: "staff.manage" },
      { path: "/departments", label: "Отделы", cap: "staff.manage" },
      { path: "/attendance", label: "Табель", cap: "attendance.manage" },
      { path: "/work-locations", label: "Рабочие локации", cap: "attendance.manage" },
    ],
  },
  {
    key: "my",
    label: "Моё",
    items: [
      { path: "/my/attendance", label: "Моя смена" },
      { path: "/my/requests", label: "Мои заявления" },
    ],
  },
  {
    key: "requests",
    label: "Заявления",
    items: [
      { path: "/requests", label: "Все заявления", cap: "request.approve" },
      { path: "/request-policies", label: "Политики согласования", cap: "request.policy.manage" },
    ],
  },
  {
    key: "admin",
    label: "Администрирование",
    items: [
      { path: "/members", label: "Участники", cap: "member.manage" },
      { path: "/roles", label: "Роли", cap: "role.manage" },
    ],
  },
];

/** Sections/items the member can see, given their capability set. */
export function visibleSections(caps: string[]): NavSection[] {
  return NAV_SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.cap || caps.includes(i.cap)),
  })).filter((s) => s.items.length > 0);
}
