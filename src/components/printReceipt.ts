/** Печать чека.
 *
 * На бумагу уходит только чек, без интерфейса кассы. Текст рендерит бэкенд
 * (`sales.domain.render_receipt` / `render_shift_report`, 42 знака в строке),
 * фронт его не пересобирает — что на экране, то и на бумаге.
 *
 * Чековый принтер (POS-80, Xprinter XP-365B и подобные) печатает на ленте 80 или
 * 58 мм; размер бумаги задаёт драйвер (например, «80 x 210mm»). Страница печати
 * поэтому фиксирует только ориентацию — `@page { size: portrait }`, — а ширину и
 * длину берёт у драйвера. Свой размер страницы (ширина ленты × длина чека) здесь
 * уже был и сломал печать: короткий чек выходил шире, чем длиннее (80 × 60 мм),
 * Chrome считал страницу альбомной, разворачивал под неё бумагу драйвера
 * (210 × 80) — и принтер печатал чек поперёк ленты.
 *
 * Чек печатается КАРТИНКАМИ, по строке, нарисованными в точках принтера
 * (8 точек на мм, 203 dpi) только чёрным и белым. Текстом он выходил на ленте
 * бледным и рваным: браузер сглаживает края букв серым, термопринтер серого не
 * умеет и растрирует его редкими точками; к тому же на кассе не нашлось Courier
 * New, и Edge подставил тонкий Consolas (26.11, фото). Чек iiko на тех же
 * принтерах чёткий, потому что iiko отдаёт драйверу текст без сглаживания.
 * Картинка в сетке точек от шрифтов и сглаживания не зависит: шрифт свой
 * (IBM Plex Mono Bold, едет с сайтом), каждый знак — в своей клетке 13 точек,
 * серое отсекается порогом. Не вышло нарисовать (нет canvas) — печатаем текстом.
 *
 * Без React намеренно: здесь только работа с окном и документом, и такой модуль
 * можно прогнать в node на заглушках — а порядок операций тут неочевиден и
 * ошибается молча (пустое превью печати выглядит как «принтер виноват»).
 */
import fontLatin from "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-700-normal.woff2?url";
import fontCyrillic from "@fontsource/ibm-plex-mono/files/ibm-plex-mono-cyrillic-700-normal.woff2?url";
import fontCyrillicExt from "@fontsource/ibm-plex-mono/files/ibm-plex-mono-cyrillic-ext-700-normal.woff2?url";

/** Ширина чековой ленты, мм. */
export type PaperWidth = 80 | 58;

/** Точек на мм у термоголовки 203 dpi. */
const DOTS_PER_MM = 8;
/** Ширина строки текста на ленте, мм. Головка печатает ~72 мм (48 мм на узкой
 * ленте), а драйвер POS-80 сдвигает страницу вправо на 2–3 мм: текст, начатый
 * в 4 мм от края страницы, на бумаге лёг в 6,6 мм (замер по фото, 26.11).
 * Поэтому полоса — до 69 мм с отступом 3 мм: на бумаге ≈ 5,6…74 мм, как у iiko
 * (4,4…75 мм), и правый край не уходит за головку. */
const TEXT_MM: Record<PaperWidth, number> = { 80: 69, 58: 47 };
const LEFT_MM = 3;
/** Знаков в строке — столько рендерит бэкенд (`RECEIPT_WIDTH`). */
const COLUMNS = 42;
/** Шаг строк к высоте шрифта — просвет между строками, как у чека iiko. */
const LINE_SPACING = 1.65;
/** Порог яркости: темнее — чёрная точка, светлее — белая. Чуть выше середины,
 * чтобы тонкие места букв не пропадали. */
const THRESHOLD = 150;
/** Самый мелкий шрифт, который ещё читается на термобумаге 203 dpi, px. */
const MIN_FONT_PX = 7;
const BASE_FONT_PX = 12;
const PX_PER_MM = 96 / 25.4;
const PAPER_KEY = "peka:receipt-paper-mm";

/** Шрифт чека — свой, едет с сайтом: на кассе может не оказаться нужного
 * системного (так и вышло с Courier New). */
const FONT_FAMILY = "PekaReceipt";
export const RECEIPT_FONT_CSS = `${FONT_FAMILY}, "Courier New", Courier, monospace`;
const FONT_FACES: [string, string][] = [
  [fontLatin, "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,"
    + "U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"],
  [fontCyrillic, "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116"],
  // Казахские буквы (ә, ғ, қ, ң, ө, ү, һ) — в расширенной кириллице.
  [fontCyrillicExt, "U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F"],
];

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

/** Сетка чека в точках принтера: клетка знака, ширина и шаг строки — и те же
 * размеры в мм для страницы (картинка ложится на ленту точка в точку). */
export interface ReceiptGrid {
  cell: number; widthDots: number; lineDots: number; fontPx: number;
  widthMm: number; lineMm: number;
}

export function receiptGrid(paper: PaperWidth = 80): ReceiptGrid {
  const cell = Math.floor(TEXT_MM[paper] * DOTS_PER_MM / COLUMNS);
  // Моноширинный шрифт: ширина знака ≈ 0,6 кегля.
  const fontPx = Math.round(cell / 0.6);
  const lineDots = Math.round(fontPx * LINE_SPACING);
  const widthDots = cell * COLUMNS;
  return { cell, widthDots, lineDots, fontPx,
           widthMm: widthDots / DOTS_PER_MM, lineMm: lineDots / DOTS_PER_MM };
}

/** Строки чека по 42 знака: бэкенд длиннее не присылает, но старый чек или
 * чужой текст режем по клеткам, а не за край ленты. */
export function receiptRows(content: string): string[] {
  const rows: string[] = [];
  for (const line of content.replace(/\r/g, "").split("\n")) {
    const chars = Array.from(line.replace(/\s+$/, ""));
    if (chars.length <= COLUMNS) {
      rows.push(chars.join(""));
      continue;
    }
    for (let i = 0; i < chars.length; i += COLUMNS) rows.push(chars.slice(i, i + COLUMNS).join(""));
  }
  while (rows.length > 0 && rows[rows.length - 1] === "") rows.pop();
  return rows;
}

/** Только чёрное и белое: термопринтер серого не печатает, а растрирует его
 * редкими точками — отсюда и были бледные рваные буквы. */
export function binarize(pixels: Uint8ClampedArray, threshold = THRESHOLD): void {
  for (let i = 0; i < pixels.length; i += 4) {
    const dark = pixels[i + 3] > 0 && pixels[i] < threshold;
    const v = dark ? 0 : 255;
    pixels[i] = v;
    pixels[i + 1] = v;
    pixels[i + 2] = v;
    pixels[i + 3] = 255;
  }
}

let fontLoading: Promise<boolean> | null = null;

/** Загрузить шрифт чека (один раз за сессию). false — не вышло (нет сети,
 * старый браузер): рисуем системным моноширинным, чётко будет и так. */
export function loadReceiptFont(): Promise<boolean> {
  if (typeof document === "undefined" || typeof FontFace === "undefined") {
    return Promise.resolve(false);
  }
  if (!fontLoading) {
    fontLoading = (async () => {
      try {
        const faces = FONT_FACES.map(([url, range]) =>
          new FontFace(FONT_FAMILY, `url(${url}) format("woff2")`,
                       { weight: "700", unicodeRange: range }));
        await Promise.all(faces.map((face) => face.load()));
        faces.forEach((face) => document.fonts.add(face));
        return true;
      } catch {
        fontLoading = null;
        return false;
      }
    })();
  }
  return fontLoading;
}

/** Нарисовать чек: по картинке PNG на строку, пустая строка — "". null — рисовать
 * негде (нет canvas). Каждый знак — в своей клетке: колонки сумм ровные, а
 * лигатуры шрифта не склеивают «-----» и «**». */
export async function renderReceiptImages(content: string,
                                          paper: PaperWidth = 80): Promise<string[] | null> {
  if (typeof document === "undefined") return null;
  const grid = receiptGrid(paper);
  const canvas = document.createElement("canvas");
  canvas.width = grid.widthDots;
  canvas.height = grid.lineDots;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  await loadReceiptFont();
  ctx.font = `700 ${grid.fontPx}px ${RECEIPT_FONT_CSS}`;
  const m = ctx.measureText("ЖДЙgyр|");
  const ascent = m.fontBoundingBoxAscent || grid.fontPx * 0.8;
  const descent = m.fontBoundingBoxDescent || grid.fontPx * 0.2;
  const baseline = Math.round((grid.lineDots - (ascent + descent)) / 2 + ascent);
  ctx.textBaseline = "alphabetic";
  return receiptRows(content).map((row) => {
    if (row.trim() === "") return "";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000";
    Array.from(row).forEach((ch, i) => {
      if (ch === " ") return;
      const w = ctx.measureText(ch).width;
      ctx.fillText(ch, i * grid.cell + (grid.cell - w) / 2, baseline);
    });
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    binarize(image.data);
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL("image/png");
  });
}

const PAGE_STYLE = "<style>@page { size: portrait; margin: 0; }</style>";

/** Документ печати из картинок строк. Картинка — ровно в точках ленты
 * (546 точек = 68,25 мм), без сглаживания при масштабе. */
export function receiptImageDocument(title: string, rows: string[],
                                     paper: PaperWidth = 80): string {
  const g = receiptGrid(paper);
  const body = rows
    .map((src) => (src ? `<img src="${src}" alt="">` : '<div class="gap"></div>'))
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
${PAGE_STYLE}
<style>
  html, body { margin: 0; padding: 0; background: #fff; }
  body { width: ${paper}mm; }
  .receipt { padding: 2mm 0 4mm ${LEFT_MM}mm; }
  .receipt img, .receipt .gap { display: block; width: ${g.widthMm}mm; height: ${g.lineMm}mm; }
  .receipt img { image-rendering: pixelated; }
</style></head><body><div class="receipt">${body}</div></body></html>`;
}

/** Документ печати текстом — запасной, если нарисовать не вышло.
 * `content` = null — чек ещё едет с сервера.
 *
 * Содержимое экранируем: в названиях блюд попадаются `<` и `&`, и без этого
 * чек ломал бы разметку. */
export function receiptDocument(title: string, content: string | null,
                                paper: PaperWidth = 80): string {
  const body = content
    ? `<pre>${escapeHtml(content)}</pre>`
    : '<div class="wait">Готовим чек…</div>';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
${PAGE_STYLE}
<style>
  html, body { margin: 0; padding: 0; background: #fff; }
  body { width: ${paper}mm; }
  pre { box-sizing: border-box; width: ${paper}mm; margin: 0; padding: 2mm 0 4mm ${LEFT_MM}mm;
        font-family: ${RECEIPT_FONT_CSS}; font-weight: 700; font-size: ${BASE_FONT_PX}px;
        line-height: ${LINE_SPACING}; color: #000; white-space: pre-wrap; overflow-wrap: anywhere; }
  .wait { font-family: system-ui, sans-serif; color: #888; padding: 16px; }
</style></head><body>${body}</body></html>`;
}

/** Текстовый чек: шрифт — чтобы 42 знака (или самая длинная строка, если
 * длиннее) заняли ровно печатную полосу. Возвращает размер шрифта, px. */
export function fitReceiptDocument(doc: Document, paper: PaperWidth = 80): {
  fontPx: number;
} {
  const pre = doc.querySelector("pre");
  let fontPx = BASE_FONT_PX;
  if (pre) {
    const longest = (pre.textContent ?? "").split("\n")
      .reduce((a, b) => (b.length > a.length ? b : a), "");
    const probe = doc.createElement("span");
    probe.style.cssText = `font-family:${RECEIPT_FONT_CSS};font-weight:700;font-size:${BASE_FONT_PX}px;`
      + "white-space:pre;position:absolute;visibility:hidden;";
    probe.textContent = longest.padEnd(COLUMNS, "0");
    doc.body.appendChild(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    if (width > 0) {
      const text = TEXT_MM[paper] * PX_PER_MM;
      fontPx = Math.max(MIN_FONT_PX, Math.floor((BASE_FONT_PX * text / width) * 10) / 10);
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
 * к серверу (и после отрисовки чека) — блокировщик всплывающих окон ни при чём.
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
  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    frame.remove();
  };
  setTimeout(remove, 5 * 60 * 1000);
  void (async () => {
    let rows: string[] | null = null;
    try {
      rows = await renderReceiptImages(content, paper);
    } catch {
      rows = null;
    }
    if (removed) return;
    writeDocument(win, rows ? receiptImageDocument(title, rows, paper)
                            : receiptDocument(title, content, paper));
    // Обработчик — после записи: document.open() снимает обработчики окна.
    // Убираем по `afterprint` (приходит и при печати, и при отмене) — с запасом:
    // превью печати строится асинхронно, и iframe, снесённый из-под него, даёт
    // пустой лист.
    win.onafterprint = () => setTimeout(remove, 1000);
    // Печать — когда картинки строк раскодированы: иначе в превью пустые места.
    await Promise.all(Array.from(win.document.images).map((img) => img.decode().catch(() => {})));
    // Текстом: шрифт чека живёт в документе кассы, а не в iframe, — здесь
    // системный моноширинный, подгоняем его под ленту.
    if (!rows) fitReceiptDocument(win.document, paper);
    win.focus();
    win.print();
  })().catch(remove);
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
