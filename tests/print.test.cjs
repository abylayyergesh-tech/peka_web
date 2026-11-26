const test = require('node:test');
const assert = require('node:assert/strict');
const { runtime } = require('./load.cjs');

test('the print page is always portrait and takes its size from the driver paper', () => {
  const { receiptDocument } = runtime().load('src/components/printReceipt.ts');
  // Свой размер страницы (80 × длина чека) у короткого чека выходил «альбомным»:
  // Chrome разворачивал бумагу драйвера, и чек печатался поперёк ленты.
  const doc80 = receiptDocument('Чек', 'ИТОГО: 100', 80);
  assert.match(doc80, /@page \{ size: portrait; margin: 0; \}/);
  assert.doesNotMatch(doc80, /size: \d+mm/);
  assert.match(doc80, /body \{ width: 80mm; \}/);
  const doc58 = receiptDocument('Чек', 'ИТОГО: 100', 58);
  assert.match(doc58, /body \{ width: 58mm; \}/);
  assert.match(doc58, /@page \{ size: portrait; margin: 0; \}/);
  // Названия блюд с «<» и «&» не ломают разметку.
  assert.match(receiptDocument('Чек', 'Кофе <3 & круассан', 80), /Кофе &#60;3 &#38; круассан/);
});

test('the roll width is remembered on this computer and defaults to 80 mm', () => {
  const env = runtime();
  const print = env.load('src/components/printReceipt.ts');
  assert.equal(print.getPaperWidth(), 80);
  print.setPaperWidth(58);
  assert.equal(print.getPaperWidth(), 58);
  print.setPaperWidth(80);
  assert.equal(print.getPaperWidth(), 80);
});
