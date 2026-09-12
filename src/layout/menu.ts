/** Single source of truth for navigation: path, RU label, required capability.
 * Items without `cap` are visible to every member of the active org.
 * Module route files must register pages at exactly these paths. */

export interface NavItem {
  path: string;
  label: string;
  cap?: string;
  /** Доп. префиксы URL, которые должны подсвечивать этот пункт: страница-деталь
   *  живёт не под `path` (например прайс меню `/menus/5` при пункте
   *  `/menu-items`), а без этого в меню не подсветится ничего. */
  match?: string[];
}

export interface NavSection {
  key: string;
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    key: "menu",
    label: "Меню",
    items: [
      { path: "/menu-items", label: "Меню", cap: "menu.manage",
        match: ["/menus"] },
      { path: "/customers", label: "Клиенты", cap: "customer.manage" },
      { path: "/announcements", label: "Объявления", cap: "announcement.manage" },
      { path: "/delivery", label: "Курьеры и маршруты", cap: "delivery.manage" },
    ],
  },
  {
    key: "inventory",
    label: "Товаро-материальный запас",
    items: [
      { path: "/recipes", label: "Тех-карты", cap: "recipe.manage" },
      { path: "/products/ingredients", label: "Сырьё", cap: "catalog.manage" },
      { path: "/products/semi-finished", label: "Полуфабрикаты", cap: "catalog.manage" },
      { path: "/products/dishes", label: "Блюда", cap: "catalog.manage" },
      // Смешанный список: сырьё, ПФ и блюда в одной таблице. Карточка строки —
      // личное дело сырья (реквизиты, КБЖУ, себестоимость, остатки, состав).
      { path: "/products", label: "Номенклатура", cap: "catalog.manage" },
      { path: "/units", label: "Единицы измерения", cap: "catalog.manage" },
      { path: "/warehouses", label: "Остатки на складах", cap: "inventory.manage",
        match: ["/reports/stock"] },
      // Фото-оцифровка живёт на /documents/digitize, но это тот же журнал
      // накладных, а не отдельный раздел.
      { path: "/documents", label: "Накладные", cap: "inventory.manage",
        match: ["/documents/digitize"] },
      { path: "/write-offs", label: "Акты списания", cap: "inventory.manage" },
      { path: "/transfer", label: "Перемещение", cap: "inventory.manage" },
      { path: "/inventory-count", label: "Инвентаризация", cap: "inventory.count" },
      { path: "/suppliers", label: "Поставщики", cap: "supplier.manage" },
      { path: "/reports/supplier-reconciliation", label: "Акт сверки", cap: "report.read" },
      { path: "/reports/trial-balance", label: "Оборотно-сальдовая ведомость",
        cap: "report.read" },
      { path: "/production-plan", label: "План и факт выпуска", cap: "inventory.manage" },
      { path: "/reports/movements", label: "Движения по складу", cap: "report.read" },
    ],
  },
  {
    key: "finance",
    label: "Финансы",
    items: [
      { path: "/expenses", label: "Расходы", cap: "finance.read" },
      { path: "/reports/expenses", label: "Реестр расходов", cap: "finance.read" },
      { path: "/expense-categories", label: "Статьи расходов", cap: "finance.read" },
      { path: "/shifts", label: "Смены, чеки, списания", cap: "sale.operate",
        match: ["/checks"] },
      { path: "/reports/pnl", label: "P&L", cap: "finance.read" },
      { path: "/reports/cash-flow", label: "Cashflow", cap: "finance.read" },
      { path: "/payroll/payments", label: "Реестр платежей", cap: "payroll.read" },
      { path: "/bank-statements", label: "Банковские выписки", cap: "payment.manage" },
      { path: "/reports/sales-by-product", label: "Продажи по товарам",
        cap: "finance.read" },
      { path: "/reports/abc", label: "ABC-анализ", cap: "finance.read" },
      { path: "/reports/replacements", label: "Замены", cap: "report.read" },
      { path: "/reports/receivables", label: "Дебиторка", cap: "report.read" },
      { path: "/reports/payables", label: "Кредиторка", cap: "report.read" },
      { path: "/reports/sales-olap", label: "OLAP отчёт", cap: "finance.read" },
      { path: "/company-entities", label: "Наши юр. лица", cap: "report.read" },
      { path: "/reports/company-entities", label: "Деньги по юр. лицам",
        cap: "report.read" },
    ],
  },
  {
    key: "hr",
    label: "HR",
    items: [
      { path: "/employees", label: "Сотрудники", cap: "staff.manage" },
      { path: "/employees/schedule", label: "График смен", cap: "staff.manage" },
      { path: "/attendance", label: "Смены", cap: "attendance.manage" },
      { path: "/payroll/timesheet", label: "Табели", cap: "payroll.read" },
      { path: "/requests", label: "Заявления", cap: "request.approve" },
      { path: "/requests/templates", label: "Шаблоны заявлений", cap: "request.approve" },
      { path: "/employees/medical-books", label: "Медкнижки", cap: "staff.manage" },
      { path: "/employees/disciplinaries", label: "Взыскания", cap: "staff.manage" },
      { path: "/departments", label: "Отделы (цеха)", cap: "staff.manage" },
      { path: "/work-locations", label: "Рабочие локации", cap: "attendance.manage" },
      { path: "/payroll/runs", label: "Ведомости", cap: "payroll.read" },
      { path: "/payroll/compensations", label: "Справочник ставок", cap: "payroll.read" },
      { path: "/payroll/loans", label: "Фин. займы", cap: "payroll.read" },
      { path: "/payroll/staff-meals", label: "Питание сотрудников", cap: "payroll.read" },
      { path: "/approval-flows", label: "Маршруты согласования",
        cap: "request.policy.manage" },
      { path: "/request-policies", label: "Пороги согласования",
        cap: "request.policy.manage" },
    ],
  },
  {
    key: "admin",
    label: "Администрирование",
    items: [
      { path: "/members", label: "Участники", cap: "member.manage" },
      { path: "/roles", label: "Роли и права", cap: "role.manage" },
      { path: "/audit", label: "Логи", cap: "member.manage" },
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
