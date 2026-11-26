const test = require('node:test');
const assert = require('node:assert/strict');
const { runtime } = require('./load.cjs');

// Файлы шрифта в node не нужны: Vite подставляет их адреса при сборке.
const FONT_MOCKS = Object.fromEntries(['latin', 'cyrillic', 'cyrillic-ext'].map(subset => [
  `@fontsource/tinos/files/tinos-${subset}-700-normal.woff2?url`,
  `/assets/tinos-${subset}.woff2`,
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
  // Запасной текстовый чек — моноширинный (колонки), жирный, заглавными.
  const doc80 = receiptDocument('Чек', 'ИТОГО: 100', 80);
  assert.match(doc80, /font-family: "Courier New", Consolas, monospace; font-weight: 700;/);
  assert.match(doc80, /text-transform: uppercase;/);
  assert.match(doc80, /line-height: 1\.65;/);
  // Названия блюд с «<» и «&» не ломают разметку.
  assert.match(receiptDocument('Чек', 'Кофе <3 & круассан', 80), /Кофе &#60;3 &#38; круассан/);
});

test('the receipt is drawn in printer dots: 42 cells of 13 dots, one image per line', () => {
  const { receiptGrid, receiptImageDocument } = load();
  // 203 dpi = 8 точек/мм: 42 × 13 = 546 точек = 68,25 мм; крупный кегль 32 точки,
  // строка 42 точки = 5,25 мм.
  const g = receiptGrid(80);
  assert.equal(JSON.stringify(g), JSON.stringify({
    cell: 13, widthDots: 546, lineDots: 42, fontPx: 32, widthMm: 68.25, lineMm: 5.25 }));
  assert.equal(receiptGrid(58).widthDots, 42 * 8);
  const doc = receiptImageDocument('Чек', ['data:image/png;base64,AA', '', 'data:image/png;base64,BB'], 80);
  // Картинка ложится на ленту точка в точку, отступ слева — 3 мм.
  assert.match(doc, /\.receipt \{ padding: 2mm 0 4mm 3mm; \}/);
  assert.match(doc, /width: 68\.25mm; height: 5\.25mm;/);
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

test('everything is printed in capitals, one character per cell', () => {
  const { upperRow } = load();
  assert.equal(upperRow('Кассир: Жансая, қала і ß').join(''), 'КАССИР: ЖАНСАЯ, ҚАЛА І ß');
  // «ß» → «SS» сдвинул бы колонки — остаётся как есть.
  assert.equal(upperRow('aßb').length, 3);
});

test('letters are thickened one dot to the right, like the printer\'s own bold', () => {
  const { embolden } = load();
  const B = [0, 0, 0, 255], W = [255, 255, 255, 255];
  // Строка 4 точки: чёрная, белая, белая, чёрная → чёрная, чёрная, белая, чёрная;
  // следующая строка картинки не наследует чёрное с конца предыдущей.
  const px = new Uint8ClampedArray([...B, ...W, ...W, ...B, ...W, ...W, ...W, ...W]);
  const out = Array.from(embolden(px, 4));
  assert.equal(JSON.stringify(out), JSON.stringify([...B, ...B, ...W, ...B, ...W, ...W, ...W, ...W]));
});

test('the roll width is remembered on this computer and defaults to 80 mm', () => {
  const print = load();
  assert.equal(print.getPaperWidth(), 80);
  print.setPaperWidth(58);
  assert.equal(print.getPaperWidth(), 58);
  print.setPaperWidth(80);
  assert.equal(print.getPaperWidth(), 80);
});
