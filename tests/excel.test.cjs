const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { runtime } = require('./load.cjs');

// Массивы из песочницы vm — с чужим прототипом: сравниваем как данные.
const plain = (v) => JSON.parse(JSON.stringify(v));

function excel() {
  return runtime({
    antd: { App: { useApp: () => ({ message: {} }) }, Button: 'button', Tooltip: 'span' },
    '@ant-design/icons': { DownloadOutlined: 'i' },
    '@/api/client': { errorMessage: String },
  }).load('src/components/excel.tsx');
}

test('cell values: numbers stay numbers, codes stay text, dates in Astana time', () => {
  const { cellValue } = excel();
  assert.equal(cellValue('12345.6000'), 12345.6);
  assert.equal(cellValue('12 345,50 ₸'), 12345.5);
  assert.equal(cellValue('2026-11-01'), '01.11.2026');
  // 04:05 UTC = 09:05 по Астане — в любом поясе браузера.
  assert.equal(cellValue('2026-11-01T04:05:00Z'), '01.11.2026 09:05');
  assert.equal(cellValue(true), 'Да');
  assert.equal(cellValue('№ 12'), '№ 12');
  assert.equal(cellValue(null), null);
  assert.equal(cellValue('—'), null);
});

test('columns from an antd table: raw numbers, rendered labels, groups, no action columns', () => {
  const { columnsFromTable } = excel();
  const Money = ({ value }) => React.createElement('span', null, value);
  const cols = columnsFromTable([
    { title: 'Способ', dataIndex: 'method', render: (v) => (v === 'cash' ? 'Наличные' : v) },
    { title: 'Сумма', dataIndex: 'amount', render: (v) => React.createElement(Money, { value: v }) },
    { title: 'Деньги', children: [{ title: 'Касса', dataIndex: ['totals', 'cash'] }] },
    { title: 'Клиент', render: (_v, r) => React.createElement('b', null, r.name) },
    { title: '', render: () => React.createElement('a', null, 'Удалить') },
  ]);
  assert.deepEqual(plain(cols.map((c) => c.title)), ['Способ', 'Сумма', 'Деньги · Касса', 'Клиент']);
  const row = { method: 'cash', amount: '150.0000', totals: { cash: '10' }, name: 'Кофейня' };
  assert.deepEqual(plain(cols.map((c) => c.value(row, 0))), ['Наличные', '150.0000', '10', 'Кофейня']);
});

test('tree rows are flattened with indentation', () => {
  const { flattenTree } = excel();
  const flat = flattenTree([{ name: 'A', children: [{ name: 'a1' }] }, { name: 'B' }], (r) => r.name);
  assert.deepEqual(plain(flat.map((r) => r.__label)), ['A', '    a1', 'B']);
});

test('a real workbook is produced by exceljs', async () => {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Тест');
  ws.addRow(['Позиция', 'Сумма']);
  ws.addRow(['Торт', 8900]);
  const buf = await wb.xlsx.writeBuffer();
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(buf);
  assert.equal(back.getWorksheet('Тест').getCell('B2').value, 8900);
});
