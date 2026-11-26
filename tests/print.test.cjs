const test = require('node:test');
const assert = require('node:assert/strict');
const { runtime } = require('./load.cjs');

// Файл шрифта в node не нужен: Vite подставляет его адрес при сборке.
const FONT_MOCKS = { '@/assets/fonts/freemono/freemono-bold.woff2?url': '/assets/freemono-bold.woff2' };
const load = (env = runtime(FONT_MOCKS)) => env.load('src/components/printReceipt.ts');

test('the print page is always portrait and takes its size from the driver paper', () => {
  const { receiptDocument, receiptImageDocument } = load();
  // Свой размер страницы (80 × длина чека) у короткого чека выходил «альбомным»:
  // Chrome разворачивал бумагу драйвера, и чек печатался поперёк ленты.
  const block = { rows: ['data:image/png;base64,AA'], widthMm: 71.875, lineMm: 5, leftMm: 0 };
  for (const doc of [receiptDocument('Чек', 'ИТОГО: 100', 80), receiptImageDocument('Чек', block, 80)]) {
    assert.match(doc, /@page \{ size: portrait; margin: 0; \}/);
    assert.doesNotMatch(doc, /size: \d+mm/);
    assert.match(doc, /body \{ width: 80mm;/);
  }
  assert.match(receiptDocument('Чек', 'ИТОГО: 100', 58), /body \{ width: 58mm; \}/);
  // Запасной текстовый чек — тем же моноширинным шрифтом, жирный, обычный регистр.
  const doc80 = receiptDocument('Чек', 'ИТОГО: 100', 80);
  assert.match(doc80, /font-family: PekaReceiptMono, "Courier New", Consolas, monospace; font-weight: 700;/);
  assert.doesNotMatch(doc80, /uppercase/);
  // Названия блюд с «<» и «&» не ломают разметку.
  assert.match(receiptDocument('Чек', 'Кофе <3 & круассан', 80), /Кофе &#60;3 &#38; круассан/);
});

test('the receipt lands on the tape like iiko: 575 dots wide, no margins, 14 bold', () => {
  const { receiptGrid, receiptImageDocument } = load();
  // 203 dpi = 8 точек/мм; ширина страницы iiko — 575 точек, отступы 0;
  // «14» — высота строки 14 пт ≈ 40 точек, кегль Courier ≈ 35 точек.
  assert.equal(JSON.stringify(receiptGrid(80)), JSON.stringify({
    cell: 575 / 42, widthDots: 575, lineDots: 40, fontPx: 35, widthMm: 71.875, lineMm: 5, leftMm: 0 }));
  // Лента 58 мм — головка 384 точки, всё пропорционально.
  const g58 = receiptGrid(58);
  assert.equal(g58.widthDots, 384);
  assert.equal(g58.fontPx, Math.round(35 * 384 / 575));
  const doc = receiptImageDocument('Чек', {
    rows: ['data:image/png;base64,AA', '', 'data:image/png;base64,BB'],
    widthMm: 71.875, lineMm: 5, leftMm: 0 }, 80);
  assert.match(doc, /padding-left:0mm/);
  assert.match(doc, /width:71\.875mm;height:5mm/);
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
