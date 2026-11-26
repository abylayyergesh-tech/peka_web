/** Печать чека.
 *
 * На бумагу уходит только чек, без интерфейса кассы. Текст рендерит бэкенд
 * (`sales.domain.render_receipt` / `render_shift_report`, 40 знаков в строке),
 * фронт его не пересобирает — что на экране, то и на бумаге.
 *
 * Чековый принтер (POS-80, Xprinter XP-365B и подобные) печатает на ленте 80 или
 * 58 мм; размер бумаги задаёт драйвер (например, «80 x 210mm»). Страница печати
 * поэтому фиксирует только ориентацию — `@page { size: portrait }`, — а ширину и
 * длину берёт у драйвера. Свой размер страницы (ширина ленты × длина чека) здесь
 * уже был и сломал печать: короткий чек выходил шире, чем длиннее (80 × 60 мм),
 * Chrome считал страницу альбомной, разворачивал под неё бумагу драйвера
 * (210 × 80) — и принтер печатал чек поперёк ленты. А чек длиннее бумаги
 * драйвера Chrome ужал бы целиком в одну страницу. Шрифт подбирается так, чтобы
 * самая длинная строка влезла в печатную ширину ленты.
 *
 * Без React намеренно: здесь только работа с окном и документом, и такой модуль
 * можно прогнать в node на заглушках — а порядок операций тут неочевиден и
 * ошибается молча (пустое превью печати выглядит как «принтер виноват»).
 */

/** Ширина чековой ленты, мм. */
export type PaperWidth = 80 | 58;

/** Печатная ширина ленты, мм: головка не печатает у самых краёв рулона. */
const PRINTABLE_MM: Record<PaperWidth, number> = { 80: 72, 58: 48 };
/** Самый мелкий шрифт, который ещё читается на термобумаге 203 dpi, px. */
const MIN_FONT_PX = 7;
const BASE_FONT_PX = 12;
const PX_PER_MM = 96 / 25.4;
const PAPER_KEY = "peka:receipt-paper-mm";

/** Лента этой кассы: у каждого компьютера свой принтер, поэтому — localStorage. */
export function getPaperWidth(): PaperWidth {
  try {
    return globalThis.localStorage?.getItem(PAPER_KEY) === "58" ? 58 : 80;
  } catch {
    return 80;
  }
}

export function setPaperWidth(width: PaperWidth): void {
  try {
    globalThis.localStorage?.setItem(PAPER_KEY, String(width));
  } catch {
    // Хранилище недоступно — останется 80 мм по умолчанию.
  }
}

/** Документ окна печати целиком. `content` = null — чек ещё едет с сервера.
 *
 * Содержимое экранируем: в названиях блюд попадаются `<` и `&`, и без этого
 * чек ломал бы разметку. */
export function receiptDocument(title: string, content: string | null,
                                paper: PaperWidth = 80): string {
  const side = (paper - PRINTABLE_MM[paper]) / 2;
  const body = content
    ? `<pre>${escapeHtml(content)}</pre>`
    : '<div class="wait">Готовим чек…</div>';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>@page { size: portrait; margin: 0; }</style>
<style>
  html, body { margin: 0; padding: 0; background: #fff; }
  body { width: ${paper}mm; }
  pre { box-sizing: border-box; width: ${paper}mm; margin: 0; padding: 2mm ${side}mm 4mm;
        font-family: "Consolas", "Courier New", monospace; font-size: ${BASE_FONT_PX}px;
        line-height: 1.3; color: #000; white-space: pre-wrap; overflow-wrap: anywhere; }
  .wait { font-family: system-ui, sans-serif; color: #888; padding: 16px; }
</style></head><body>${body}</body></html>`;
}

/** Подогнать свёрстанный чек под ленту: шрифт — чтобы самая длинная строка
 * влезла в печатную ширину. Возвращает итоговый размер шрифта, px. */
export function fitReceiptDocument(doc: Document, paper: PaperWidth = 80): {
  fontPx: number;
} {
  const pre = doc.querySelector("pre");
  let fontPx = BASE_FONT_PX;
  if (pre) {
    const longest = (pre.textContent ?? "").split("\n")
      .reduce((a, b) => (b.length > a.length ? b : a), "");
    const probe = doc.createElement("span");
    probe.style.cssText = `font-family:"Consolas","Courier New",monospace;font-size:${BASE_FONT_PX}px;`
      + "white-space:pre;position:absolute;visibility:hidden;";
    probe.textContent = longest;
    doc.body.appendChild(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    const printable = PRINTABLE_MM[paper] * PX_PER_MM;
    if (width > printable) {
      fontPx = Math.max(MIN_FONT_PX, Math.floor((BASE_FONT_PX * printable / width) * 10) / 10);
      pre.style.fontSize = `${fontPx}px`;
    }
  }
  return { fontPx };
}

/** Отправить чек на печать — через скрытый iframe на этой же странице.
 *
 * Раньше чек печатался в отдельном всплывающем окне. Такое окно (`window.open`
 * того же сайта) живёт в одном потоке с кассой, и пока в нём открыт диалог
 * печати, касса не отвечает. Окно к тому же легко уходит за основное или на
 * второй монитор: оператор видит «замёрзшую» кассу, жмёт по ней, и браузер
 * предлагает убить страницу. Диалог печати iframe показывается прямо поверх
 * вкладки кассы — потеряться ему негде, и закрыв его, оператор сразу
 * продолжает работу.
 *
 * Всплывающих окон больше нет, поэтому печать можно звать и после запросов
 * к серверу — блокировщик всплывающих окон тут ни при чём.
 *
 * false — печатать негде (нет `document`, iframe не создался); вызывающий
 * оставляет чек на экране, его напечатают кнопкой. */
export function printReceiptText(content: string, title = "Чек",
                                 paper: PaperWidth = getPaperWidth()): boolean {
  if (typeof document === "undefined") return false;
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  // Не display:none — такой iframe часть браузеров печатает пустым листом.
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  const win = frame.contentWindow;
  if (!win) {
    frame.remove();
    return false;
  }
  writeDocument(win, receiptDocument(title, content, paper));
  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    frame.remove();
  };
  // Убираем по `afterprint` (приходит и при печати, и при отмене) — с запасом:
  // превью печати строится асинхронно, и iframe, снесённый из-под него, даёт
  // пустой лист. Страховка — если событие не пришло вовсе.
  win.onafterprint = () => setTimeout(remove, 1000);
  setTimeout(remove, 5 * 60 * 1000);
  // Печать — следующим тиком, после отрисовки документа: тогда же подгоняем
  // шрифт под свёрстанный чек.
  setTimeout(() => {
    try {
      fitReceiptDocument(win.document, paper);
      win.focus();
      win.print();
    } catch {
      remove();
    }
  }, 50);
  return true;
}

function writeDocument(win: Window, html: string): void {
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function escapeHtml(s: string): string {
  return s.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);
}
