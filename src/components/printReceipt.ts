/** Печать чека.
 *
 * На бумагу уходит только чек, без интерфейса кассы. Текст рендерит бэкенд
 * (`sales.domain.render_receipt` / `render_shift_report`, 42 знака в строке,
 * раскладка чека iiko), фронт его не пересобирает — что на экране, то и на бумаге.
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
 * Картинка в сетке точек от шрифтов и сглаживания не зависит: шрифт свой (едет
 * с сайтом), каждый знак — в своей клетке, серое отсекается порогом. Не вышло
 * нарисовать (нет canvas) — печатаем текстом.
 *
 * Вид — как у чека iiko (настройки iiko: «стандартный шрифт 14 жирный», ширина
 * страницы 575 точек, отступы 0): моноширинный шрифт в духе Courier New —
 * FreeMono Bold, — сжатый по ширине так, чтобы 42 знака заняли 575 точек, кегль
 * 35 точек (14 пт высоты строки), строка 5 мм. Касса выбрала его 26.11 из восьми
 * напечатанных вариантов (Times заглавными разной жирности, Courier New с
 * компьютера, FreeMono с утолщением и заглавными) — «вариант 6».
 *
 * Без React намеренно: здесь только работа с окном и документом, и такой модуль
 * можно прогнать в node на заглушках — а порядок операций тут неочевиден и
 * ошибается молча (пустое превью печати выглядит как «принтер виноват»).
 */
import fontMonoBold from "@/assets/fonts/freemono/freemono-bold.woff2?url";

/** Ширина чековой ленты, мм. */
export type PaperWidth = 80 | 58;

/** Точек на мм у термоголовки 203 dpi. */
const DOTS_PER_MM = 8;
/** Ширина строки текста, точек: как «ширина страницы» в iiko (575 точек =
 * 71,9 мм — вся головка ленты 80 мм; у ленты 58 мм головка — 384 точки). */
const WIDTH_DOTS: Record<PaperWidth, number> = { 80: 575, 58: 384 };
/** Отступ слева, мм: как в iiko — 0. */
const LEFT_MM = 0;
/** Знаков в строке — столько рендерит бэкенд (`RECEIPT_WIDTH`). */
const COLUMNS = 42;
/** Кегль и шаг строк на ленте 80 мм, точек: «14» в iiko — высота строки в
 * пунктах, 14 пт на 203 dpi ≈ 39,5 точки; у Courier это кегль ≈ 35 точек
 * (заглавная ≈ 20 точек = 2,5 мм — как на фото чека iiko). */
const FONT_DOTS = 35;
const LINE_DOTS = 40;
/** Шаг строк текстового (запасного) чека к высоте шрифта. */
const LINE_SPACING = 1.15;
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
const FONT_FAMILY = "PekaReceiptMono";
/** Шрифт чека для CSS: превью на экране и запасная печать текстом. FreeMono
 * моноширинный — колонки на экране стоят как на ленте. */
export const RECEIPT_FONT_CSS = `${FONT_FAMILY}, "Courier New", Consolas, monospace`;

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

/** Сетка чека в точках принтера — и те же размеры в мм для страницы (картинка
 * ложится на ленту точка в точку). Лента 58 мм — всё пропорционально. */
export interface ReceiptGrid {
  cell: number; widthDots: number; lineDots: number; fontPx: number;
  widthMm: number; lineMm: number; leftMm: number;
}

export function receiptGrid(paper: PaperWidth = 80): ReceiptGrid {
  const widthDots = WIDTH_DOTS[paper];
  const k = widthDots / WIDTH_DOTS[80];
  const lineDots = Math.round(LINE_DOTS * k);
  return { cell: widthDots / COLUMNS, widthDots, lineDots, fontPx: Math.round(FONT_DOTS * k),
           widthMm: widthDots / DOTS_PER_MM, lineMm: lineDots / DOTS_PER_MM, leftMm: LEFT_MM };
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
        const face = new FontFace(FONT_FAMILY, `url(${fontMonoBold}) format("woff2")`,
                                  { weight: "700" });
        await face.load();
        document.fonts.add(face);
        return true;
      } catch {
        fontLoading = null;
        return false;
      }
    })();
  }
  return fontLoading;
}

/** Нарисованный чек: картинки строк ("" — пустая строка) и их место на ленте. */
export interface ReceiptBlock { rows: string[]; widthMm: number; lineMm: number; leftMm: number }

/** Нарисовать чек: по картинке PNG на строку. null — рисовать негде (нет
 * canvas). Каждый знак — в своей клетке; шрифт сжат по ширине целиком, одним
 * коэффициентом, — так iiko сжимает Courier New через драйвер. */
export async function renderReceiptImages(content: string,
                                          paper: PaperWidth = 80): Promise<ReceiptBlock | null> {
  if (typeof document === "undefined") return null;
  const grid = receiptGrid(paper);
  const canvas = document.createElement("canvas");
  canvas.width = grid.widthDots;
  canvas.height = grid.lineDots;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  await loadReceiptFont();
  ctx.font = `700 ${grid.fontPx}px ${RECEIPT_FONT_CSS}`;
  ctx.textBaseline = "alphabetic";
  // Заглавные — по центру строки; хвосты «Д», «Щ» и запятых уходят вниз.
  const cap = ctx.measureText("Н").actualBoundingBoxAscent || grid.fontPx * 0.6;
  const baseline = Math.round((grid.lineDots + cap) / 2);
  const scale = Math.min(1, grid.cell / (ctx.measureText("0").width || grid.cell));
  const rows = receiptRows(content).map((row) => {
    if (row.trim() === "") return "";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000";
    Array.from(row).forEach((ch, i) => {
      if (ch === " ") return;
      const w = ctx.measureText(ch).width;
      if (w <= 0) return;
      ctx.save();
      ctx.translate(i * grid.cell + grid.cell / 2, baseline);
      ctx.scale(scale, 1);
      ctx.fillText(ch, -w / 2, 0);
      ctx.restore();
    });
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    binarize(image.data);
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL("image/png");
  });
  return { rows, widthMm: grid.widthMm, lineMm: grid.lineMm, leftMm: grid.leftMm };
}

const PAGE_STYLE = "<style>@page { size: portrait; margin: 0; }</style>";

/** Документ печати из картинок строк. Картинка — ровно в точках ленты
 * (575 точек = 71,875 мм), без сглаживания при масштабе. */
export function receiptImageDocument(title: string, block: ReceiptBlock,
                                     paper: PaperWidth = 80): string {
  const size = `width:${block.widthMm}mm;height:${block.lineMm}mm`;
  const rows = block.rows
    .map((src) => (src ? `<img src="${src}" alt="" style="${size}">`
                       : `<div class="gap" style="${size}"></div>`))
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
${PAGE_STYLE}
<style>
  html, body { margin: 0; padding: 0; background: #fff; }
  body { width: ${paper}mm; padding: 2mm 0 4mm; }
  .receipt img, .receipt .gap { display: block; }
  .receipt img { image-rendering: pixelated; }
</style></head><body><div class="receipt" style="padding-left:${block.leftMm}mm">${rows}</div></body></html>`;
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
 * длиннее) заняли ровно ширину строки. Возвращает размер шрифта, px. */
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
      const text = (WIDTH_DOTS[paper] / DOTS_PER_MM) * PX_PER_MM;
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
    let block: ReceiptBlock | null = null;
    try {
      block = await renderReceiptImages(content, paper);
    } catch {
      block = null;
    }
    if (removed) return;
    writeDocument(win, block ? receiptImageDocument(title, block, paper)
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
    if (!block) fitReceiptDocument(win.document, paper);
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
