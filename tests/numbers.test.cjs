const test = require('node:test');
const assert = require('node:assert/strict');
const { runtime } = require('./load.cjs');

// Значения из VM-контекста загрузчика: у них свои прототипы, deepEqual их не
// сравнит. Сравниваем как данные.
const plain = (value) => JSON.parse(JSON.stringify(value));

// Разделители разрядов ru-RU: неразрывный пробел и узкий неразрывный.
const NBSP = String.fromCharCode(0xa0);
const NNBSP = String.fromCharCode(0x202f);

test('large numbers get line-break points only between digit groups', () => {
  const { digitGroups, fmtMoney } = runtime().load('src/components/format.tsx');
  assert.deepEqual(plain(digitGroups(`12${NBSP}345${NBSP}678,90`)), [`12${NBSP}`, `345${NBSP}`, '678,90']);
  assert.deepEqual(plain(digitGroups(`1${NNBSP}234`)), [`1${NNBSP}`, '234']);
  assert.deepEqual(plain(digitGroups('42')), ['42']);
  assert.deepEqual(plain(digitGroups('')), []);
  // Склейка обратно даёт ровно то, что отформатировал fmtMoney.
  const text = fmtMoney('123456789.5');
  assert.equal(digitGroups(text).join(''), text);
  assert.ok(digitGroups(text).length >= 3);
});

test('stat tiles format raw values and shorten only when asked', () => {
  const { statText, fmtCompact } = runtime().load('src/components/numberDisplay.ts');
  const { fmtMoney } = runtime().load('src/components/format.tsx');

  assert.deepEqual(plain(statText('12345678.9', 'money', 'full')), { text: fmtMoney('12345678.9') });
  const short = statText('12345678.9', 'money', 'compact');
  assert.equal(short.text, fmtCompact(12345678.9));
  assert.match(short.text, /млн/);
  assert.equal(short.full, fmtMoney('12345678.9'));

  // Меньше миллиона и счётчики не сокращаются: «850 тыс.» только путает.
  assert.deepEqual(plain(statText('850000', 'money', 'compact')), { text: fmtMoney('850000') });
  assert.equal(statText(2500000, 'count', 'compact').full, undefined);
  assert.equal(statText(-3000000, 'whole', 'compact').full, `-3${NBSP}000${NBSP}000`);

  assert.deepEqual(plain(statText(null, 'money', 'full')), { text: '—' });
  assert.deepEqual(plain(statText('3 / 10', undefined, 'compact')), { text: '3 / 10' });
  assert.deepEqual(plain(statText(1234, undefined, 'full')), { text: `1${NBSP}234` });
});

test('number display mode is remembered in this browser', () => {
  const first = runtime();
  const store = first.load('src/components/numberDisplay.ts').useNumberDisplay;
  assert.equal(store.getState().mode, 'full');
  store.getState().setMode('compact');
  assert.equal(store.getState().mode, 'compact');

  const again = runtime({}, first.storage).load('src/components/numberDisplay.ts').useNumberDisplay;
  assert.equal(again.getState().mode, 'compact');
});
