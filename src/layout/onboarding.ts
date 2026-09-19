import type { NavSection } from "@/layout/menu";

export const tourStorageKey = (identity: string) => `peka-web:onboarding:v1:${identity}`;

export interface IntroStep { title: string; description: string; selector?: string }

const descriptions: Record<string, string> = {
  menu: "Здесь находятся меню продукции, клиенты, объявления и доставка. Начните с нужного раздела — в нём доступны списки и карточки.",
  inventory: "Техкарты, сырьё, остатки, накладные и выпуск собраны здесь. Перед проведением документа проверьте склад, дату и состав.",
  finance: "Здесь доступны финансовые операции и отчёты. Проверяйте выбранный период и организацию перед сверкой сумм.",
  hr: "Сотрудники, смены, заявления и расчёты собраны в кадровом разделе. Список доступных действий зависит от ваших прав.",
  admin: "Участники и роли определяют доступ к системе. Выдавайте сотруднику только те права, которые нужны для его работы.",
};

export function introductionSteps(sections: NavSection[]): IntroStep[] {
  return [
    { title: "Добро пожаловать в Pekarelli", description: "Короткое знакомство поможет найти основные инструменты. Используйте «Далее» и «Назад». Тур можно закрыть крестиком и снова открыть в меню профиля." },
    { title: "Проверьте организацию", description: "Все данные и действия относятся к выбранной организации. При переключении меняются списки, отчёты и доступные разделы.", selector: "[data-tour='organization']" },
    ...sections.map((section) => ({ title: section.label,
      description: descriptions[section.key] ?? `Доступные вам инструменты: ${section.items.map((item) => item.label).join(", ")}.`,
      selector: `[data-tour-section='${section.key}']` })),
    { title: "Рабочая область", description: "Выберите раздел слева, чтобы открыть его список или отчёт. В карточках можно просмотреть детали; действия сохранения и проведения применяют изменения.", selector: "[data-tour='workspace']" },
    { title: "Профиль и помощь", description: "Здесь можно сменить пароль, выйти из аккаунта или повторить этот тур. Всё готово — выберите нужный раздел и приступайте к работе.", selector: "[data-tour='profile']" },
  ];
}
