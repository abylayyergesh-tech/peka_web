/** Печать чека.
 *
 * На бумагу уходит только чек, без интерфейса кассы, и одинаково на термопринтере
 * (58/80 мм) и на обычном А4. Текст рендерит бэкенд (`sales.domain.render_receipt`
 * / `render_shift_report`), фронт его не пересобирает — что на экране, то и на
 * бумаге.
 *
 * Без React намеренно: здесь только работа с окном и документом, и такой модуль
 * можно прогнать в node на заглушках — а порядок операций тут неочевиден и
 * ошибается молча (пустое превью печати выглядит как «принтер виноват»).
 */

/** Документ окна печати целиком. `content` = null — чек ещё едет с сервера.
 *
 * Содержимое экранируем: в названиях блюд попадаются `<` и `&`, и без этого
 * чек ломал бы разметку. Ширина в мм под рулон; 3мм шрифт ≈ 42 знака в строке. */
export function receiptDocument(title: string, content: string | null): string {
  const body = content
    ? `<pre>${escapeHtml(content)}</pre>`
    : '<div class="wait">Готовим чек…</div>';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  @page { margin: 4mm; }
  body { margin: 0; }
  pre { font-family: "Consolas", "Courier New", monospace; font-size: 12px;
        line-height: 1.35; white-space: pre; margin: 0; }
  .wait { font-family: system-ui, sans-serif; color: #888; padding: 16px; }
</style></head><body>${body}</body></html>`;
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
export function printReceiptText(content: string, title = "Чек"): boolean {
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
  writeDocument(win, receiptDocument(title, content));
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
  // Печать — следующим тиком, после отрисовки документа.
  setTimeout(() => {
    try {
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
