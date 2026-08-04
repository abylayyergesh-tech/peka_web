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
    key: "catalog",
    label: "Каталог",
    items: [
      // Права на пунктах обязательны: peka_web — рабочее место администрации, и
      // раздел без `cap` был бы виден любому участнику, включая цех.
      { path: "/products", label: "Продукты", cap: "catalog.manage" },
      { path: "/units", label: "Единицы измерения", cap: "catalog.manage" },
      { path: "/recipes", label: "Тех-карты", cap: "recipe.manage" },
    ],
  },
  {
    // Один путь товара: поставщик → заказ → приход → склад. Разделять «Закупки»
    // и «Склад» было нечем: документ прихода принадлежит обоим сразу.
    key: "inventory",
    label: "Закупки и склад",
    items: [
      // Остатки и справочник складов — одна страница с вкладками: это одна и та
      // же сущность, просто «сколько лежит» и «где лежит».
      { path: "/warehouses", label: "Склады и остатки", cap: "inventory.manage",
        match: ["/reports/stock"] },
      { path: "/documents", label: "Документы", cap: "inventory.manage" },
      // Инвентаризация — отдельным правом: перебить остаток значит исправить
      // факт, и это дело администрации (owner, manager и АУП), а не любого, кто
      // ведёт склад. Рядовому сотруднику пункт не виден.
      { path: "/inventory-count", label: "Инвентаризация", cap: "inventory.count" },
      // Выпуск продукции: прогноз на день и факт по итогу. Живёт в складском
      // разделе, потому что и планируют, и сверяют это те же люди, что ведут
      // склад; тот же лист вбивают с телефона в кабинете сотрудника.
      { path: "/production-plan", label: "Выпуск продукции", cap: "inventory.manage" },
      { path: "/documents/digitize", label: "Оцифровка накладной", cap: "inventory.manage" },
      { path: "/suppliers", label: "Поставщики", cap: "supplier.manage" },
      // «Заказы поставщикам» убраны из меню по решению владельца: закупка идёт
      // без предзаказов, приход заводится накладной. Страницы живы по прямым
      // ссылкам (/purchase-orders) — данные и история заказов никуда не делись.
    ],
  },
  {
    key: "sales",
    label: "Продажи",
    items: [
      // Позиции (что продаём) и прайс-листы (по какой цене кому) — вкладки одной
      // страницы: цена меню бессмысленна без позиции, к которой она относится.
      { path: "/menu-items", label: "Меню и прайс-листы", cap: "menu.manage",
        match: ["/menus"] },
      // Чек живёт внутри смены и без неё не имеет смысла — это вкладки одной
      // страницы, а не два раздела.
      { path: "/shifts", label: "Смены и чеки", cap: "sale.operate", match: ["/checks"] },
      { path: "/customers", label: "Клиенты", cap: "customer.manage" },
      // Лента цеха на «Главной» клиентского сайта: чем живёт пекарня, чего не
      // будет завтра, что появилось в меню. Обращение к тем же клиентам, что
      // строкой выше, поэтому раздел один.
      { path: "/announcements", label: "Объявления", cap: "announcement.manage" },
    ],
  },
  {
    // Отчёты почти все про деньги, а «Расходы» и «Выписки» — это и есть источник
    // цифр в них, поэтому раздел один.
    key: "finance",
    label: "Финансы и отчёты",
    items: [
      { path: "/expenses", label: "Расходы", cap: "finance.read" },
      { path: "/expense-categories", label: "Статьи расходов", cap: "finance.read" },
      // Оплаты поставщикам растут из выписок — раздел живёт в финансах.
      { path: "/bank-statements", label: "Банковские выписки", cap: "payment.manage" },
      { path: "/reports/movements", label: "Движения по складу", cap: "report.read" },
      { path: "/reports/product-cost", label: "Себестоимость", cap: "report.read" },
      // «Продажи» — так же называется раздел, поэтому здесь уточняем.
      { path: "/reports/sales", label: "Отчёт по продажам", cap: "report.read" },
      // Тот же период, но по каждому товару: выручка, себестоимость, маржа. Право
      // финансовое, а не отчётное: у оператора кассы `report.read` есть (сменные
      // отчёты), а себестоимость и маржа — цифры администрации.
      { path: "/reports/sales-by-product", label: "Продажи по товарам", cap: "finance.read" },
      { path: "/reports/abc", label: "ABC-анализ", cap: "finance.read" },
      // Деньги, а не прибыль: пришло / ушло / осталось. Рядом с P&L, потому что
      // первый вопрос после «сколько заработали» — «а где эти деньги».
      { path: "/reports/cash-flow", label: "Движение денег", cap: "finance.read" },
      { path: "/reports/replacements", label: "Замены", cap: "report.read" },
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
      { path: "/departments", label: "Отделы (цеха)", cap: "staff.manage" },
      // Отметки прихода/ухода. Сводный табель смен живёт в разделе «Зарплата»:
      // он собирается из этих отметок и служит основой ведомости.
      { path: "/attendance", label: "Отметки смен", cap: "attendance.manage" },
      { path: "/work-locations", label: "Рабочие локации", cap: "attendance.manage" },
    ],
  },
  {
    key: "payroll",
    label: "Зарплата",
    items: [
      { path: "/payroll/timesheet", label: "Табель смен", cap: "payroll.read" },
      { path: "/payroll/runs", label: "Ведомости", cap: "payroll.read" },
      { path: "/payroll/compensations", label: "Справочник ставок", cap: "payroll.read" },
      { path: "/payroll/loans", label: "Фин. займы", cap: "payroll.read" },
      { path: "/payroll/payments", label: "Реестр выплат", cap: "payroll.read" },
    ],
  },
  // Раздела «Моё» здесь больше нет: свою смену и свои заявления сотрудник
  // ведёт в отдельном кабинете (peka_staff). peka_web — рабочее место
  // администрации, и мешать в нём личные экраны с управленческими незачем.
  {
    key: "requests",
    label: "Заявления",
    items: [
      { path: "/requests", label: "Все заявления", cap: "request.approve" },
      { path: "/approval-flows", label: "Маршруты согласования", cap: "request.policy.manage" },
      { path: "/request-policies", label: "Пороги согласования", cap: "request.policy.manage" },
    ],
  },
  {
    key: "admin",
    label: "Администрирование",
    items: [
      { path: "/members", label: "Участники", cap: "member.manage" },
      { path: "/roles", label: "Роли", cap: "role.manage" },
      { path: "/audit", label: "Журнал действий", cap: "member.manage" },
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
