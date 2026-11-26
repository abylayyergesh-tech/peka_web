const test = require('node:test');
const assert = require('node:assert/strict');
const { runtime } = require('./load.cjs');

// Файлы шрифта в node не нужны: Vite подставляет их адреса при сборке.
const FONT_MOCKS = Object.fromEntries(['latin', 'cyrillic', 'cyrillic-ext'].map(subset => [
  `@fontsource/ibm-plex-mono/files/ibm-plex-mono-${subset}-700-normal.woff2?url`,
  `/assets/plex-${subset}.woff2`,
]));
const load = (env = runtime(FONT_MOCKS)) => env.load('src/components/printReceipt.ts');

test('the print page is always portrait and takes its size from the driver paper', () => {
  const { receiptDocument, receiptImageDocument } = load();
  // Свой размер страницы (80 × длина чека) у короткого чека выходил «альбомным»:
  // Chrome разворачивал бумагу драйвера, и чек печатался поперёк ленты.
  for (const doc of [receiptDocument('Чек', 'ИТОГО: 100', 80),
                     receiptImageDocument('Чек', ['data:image/png;base64,AA'], 80)]) {
    assert.match(doc, /@page \{ size: portrait; margin: 0; \}/);
    assert.doesNotMatch(doc, /size: \d+mm/);
    assert.match(doc, /body \{ width: 80mm; \}/);
  }
  const doc58 = receiptDocument('Чек', 'ИТОГО: 100', 58);
  assert.match(doc58, /body \{ width: 58mm; \}/);
  // Запасной текстовый чек — тем же шрифтом, жирный, строки с просветом.
  const doc80 = receiptDocument('Чек', 'ИТОГО: 100', 80);
  assert.match(doc80, /font-family: PekaReceipt, "Courier New", Courier, monospace; font-weight: 700;/);
  assert.match(doc80, /line-height: 1\.65;/);
  // Названия блюд с «<» и «&» не ломают разметку.
  assert.match(receiptDocument('Чек', 'Кофе <3 & круассан', 80), /Кофе &#60;3 &#38; круассан/);
});

test('the receipt is drawn in printer dots: 42 cells of 13 dots, one image per line', () => {
  const { receiptGrid, receiptImageDocument } = load();
  // 203 dpi = 8 точек/мм: 42 × 13 = 546 точек = 68,25 мм, строка 36 точек = 4,5 мм.
  const g = receiptGrid(80);
  assert.equal(JSON.stringify(g), JSON.stringify({
    cell: 13, widthDots: 546, lineDots: 36, fontPx: 22, widthMm: 68.25, lineMm: 4.5 }));
  assert.equal(receiptGrid(58).widthDots, 42 * 8);
  const doc = receiptImageDocument('Чек', ['data:image/png;base64,AA', '', 'data:image/png;base64,BB'], 80);
  // Картинка ложится на ленту точка в точку, отступ слева — 3 мм.
  assert.match(doc, /\.receipt \{ padding: 2mm 0 4mm 3mm; \}/);
  assert.match(doc, /width: 68\.25mm; height: 4\.5mm;/);
  assert.match(doc, /image-rendering: pixelated;/);
  assert.equal((doc.match(/<img /g) ?? []).length, 2);
  assert.equal((doc.match(/class="gap"/g) ?? []).length, 1);
});

test('lines are cut at 42 cells and trailing blanks are dropped', () => {
  const { receiptRows } = load();
  const long = 'Адрес: ' + 'я'.repeat(50);
  const rows = receiptRows(`Чек\r\n${long}\n\nИТОГО   \n\n\n`);
  assert.equal(JSON.stringify(rows),
    JSON.stringify(['Чек', long.slice(0, 42), long.slice(42), '', 'ИТОГО']));
});

test('only black and white reaches the thermal head', () => {
  const { binarize } = load();
  // Серые края букв термопринтер растрирует редкими точками — отсюда рваные буквы.
  const px = new Uint8ClampedArray([
    20, 20, 20, 255,     // тёмный — чёрная точка
    149, 149, 149, 255,  // темнее порога — чёрная
    151, 151, 151, 255,  // светлее порога — белая
    0, 0, 0, 0,          // прозрачный — белый
  ]);
  binarize(px);
  assert.equal(JSON.stringify(Array.from(px)), JSON.stringify([
    0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255]));
});

test('the roll width is remembered on this computer and defaults to 80 mm', () => {
  const print = load();
  assert.equal(print.getPaperWidth(), 80);
  print.setPaperWidth(58);
  assert.equal(print.getPaperWidth(), 58);
  print.setPaperWidth(80);
  assert.equal(print.getPaperWidth(), 80);
});
