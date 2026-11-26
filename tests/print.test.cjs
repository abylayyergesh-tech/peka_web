const test = require('node:test');
const assert = require('node:assert/strict');
const { runtime } = require('./load.cjs');

test('the print page is sized to the receipt roll, not to the driver default paper', () => {
  const { receiptDocument } = runtime().load('src/components/printReceipt.ts');
  const doc80 = receiptDocument('Чек', 'TOTAL: 100', 80);
  assert.match(doc80, /@page \{ size: 80mm \d+mm; margin: 0; \}/);
  assert.match(doc80, /body \{ width: 80mm; \}/);
  const doc58 = receiptDocument('Чек', 'TOTAL: 100', 58);
  assert.match(doc58, /@page \{ size: 58mm \d+mm; margin: 0; \}/);
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
