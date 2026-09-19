/** Тема antd на цветах брендбука Pekarelli — один файл на всё приложение.
 *
 *   #004438  тёмно-зелёный — основной (кнопки, ссылки, выделение)
 *   #D3DF2A  лайм         — акцент: активный пункт меню на зелёном сайдбаре
 *   #F9F7E1  кремовый     — фон рабочей области
 *   #FAF077  жёлтый       — мягкое предупреждение
 *
 * Успех НЕ красим в фирменный зелёный: тег «Проведён» не должен выглядеть как
 * кнопка, а «Активен» — как выделенная строка. Поэтому статусы остаются своими
 * цветами antd, а фирменный зелёный обозначает действие и выбор.
 */
import type { ThemeConfig } from "antd";

export const BRAND = {
  green: "#004438",
  greenDark: "#00352c",
  greenSoft: "#eef5f2",
  lime: "#d3df2a",
  limeInk: "#3c4708",
  cream: "#f9f7e1",
  butter: "#faf077",
} as const;

export const theme: ThemeConfig = {
  token: {
    colorPrimary: BRAND.green,
    colorLink: BRAND.green,
    colorInfo: BRAND.green,
    colorWarning: "#8a6a06",
    borderRadius: 12,
    colorBgLayout: BRAND.cream,
    // Крупнее базовых 14: интерфейс смотрят с расстояния, а таблицы плотные.
    // Остальные размеры antd выводит отсюда (SM = 14, LG = 18, заголовки).
    fontSize: 16,
    // Единый жирный: шапки, заголовки, выбранные пункты, strong.
    fontWeightStrong: 700,
    // Рамка контролов и таблиц — 2px, иначе на кремовом фоне 1px пропадает.
    lineWidth: 2,
    colorBorder: BRAND.green,
    colorBorderSecondary: "#1a5c50",
    // Segoe UI Variable Text первым: в Windows 11 это переменный шрифт, и
    // вес 700 в нём настоящий. В статичном Segoe UI браузер мог бы сгладить.
    fontFamily:
      "'Segoe UI Variable Text', 'Segoe UI', -apple-system, BlinkMacSystemFont, " +
      "Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  components: {
    Layout: {
      // Сайдбар фирменного зелёного: логотип на нём идёт в белом варианте.
      siderBg: BRAND.green,
      triggerBg: BRAND.greenDark,
      headerBg: "#ffffff",
    },
    Menu: {
      darkItemBg: BRAND.green,
      darkSubMenuItemBg: BRAND.greenDark,
      darkItemSelectedBg: BRAND.lime,
      // Тёмно-зелёный текст на лайме: белый на нём не читается вовсе.
      darkItemSelectedColor: BRAND.green,
      darkItemHoverBg: "#0b5849",
      darkItemColor: "rgba(255,255,255,0.78)",
    },
    Button: {
      primaryShadow: "none",
      defaultBorderColor: BRAND.green,
      defaultColor: BRAND.green,
      fontWeight: 700,
    },
    Input: {
      hoverBorderColor: BRAND.green,
      activeBorderColor: BRAND.green,
    },
    Select: {
      hoverBorderColor: BRAND.green,
      activeBorderColor: BRAND.green,
    },
    Card: {
      lineWidth: 2,
    },
    Table: {
      // Жёлтое наведение как у /products/ingredients — токен, которым antd
      // красит `.ant-table-cell-row-hover`. Без него штатный hover на креме
      // не читается. CSS в index.css дублирует это с запасом специфичности.
      rowHoverBg: "#e2ea75",
      borderColor: BRAND.green,
      headerColor: BRAND.green,
      headerBg: "#ffffff",
      headerBorderRadius: 12,
      cellFontSize: 16,
    },
    Descriptions: {
      labelColor: BRAND.green,
    },
    Drawer: {
      lineWidth: 2,
    },
    Modal: {
      lineWidth: 2,
    },
  },
};
