const test = require('node:test');
const assert = require('node:assert/strict');
const { runtime } = require('./load.cjs');

// Значения из VM-контекста загрузчика: у них свои прототипы, deepEqual их не
// сравнит. Сравниваем как данные.
const plain = (value) => JSON.parse(JSON.stringify(value));

function load() {
  const env = runtime();
  return { env, menu: env.load('src/layout/menu.ts'), tour: env.load('src/layout/onboarding.ts') };
}
const ALL_CAPS = (menu) => [...new Set(menu.NAV_SECTIONS.flatMap(s => s.items.map(i => i.cap)))];

test('chapters cover only sections the member can see', () => {
  const { menu, tour } = load();
  const chapters = tour.tourChapters(menu.visibleSections(['customer.manage']));
  assert.deepEqual(plain(chapters.map(c => c.key)), ['overview', 'lists', 'menu']);

  // В разделе «Меню» человеку виден один экран — тур не рассказывает о прочих
  // и не учит «добавлять позицию в меню», на которую у него нет права.
  const menuChapter = chapters[2];
  const labels = menuChapter.steps.flatMap(s => (s.items ?? []).map(i => i.label));
  assert.deepEqual(plain(labels), ['Клиенты']);
  assert.ok(!menuChapter.steps.some(s => s.link && s.link.path !== '/customers'));

  const sidebar = chapters[0].steps.find(s => s.selector === "[data-tour='sidebar']");
  assert.deepEqual(plain(sidebar.items.map(i => i.label)), ['Меню']);
});

test('every menu screen has a hint and exactly one group, every workflow a real screen', () => {
  const { menu, tour } = load();
  for (const section of menu.NAV_SECTIONS) {
    const guide = tour.SECTION_GUIDES[section.key];
    assert.ok(guide, `нет главы для раздела ${section.key}`);
    const paths = section.items.map(i => i.path);
    for (const path of paths) {
      assert.ok(tour.ITEM_HINTS[path], `нет пояснения для ${path}`);
      const groups = guide.groups.filter(g => g.paths.includes(path));
      assert.equal(groups.length, 1, `${path} должен быть ровно в одной группе`);
    }
    for (const group of guide.groups) {
      for (const path of group.paths) assert.ok(paths.includes(path), `${path} нет в разделе ${section.key}`);
    }
    for (const flow of guide.workflows) {
      assert.ok(paths.includes(flow.path), `инструкция «${flow.title}» ведёт на ${flow.path} вне раздела`);
      assert.ok(flow.howto.length >= 2, `в «${flow.title}» слишком мало шагов`);
    }
  }
});

test('full access gets every section chapter with groups and how-tos', () => {
  const { menu, tour } = load();
  const chapters = tour.tourChapters(menu.visibleSections(ALL_CAPS(menu)));
  assert.deepEqual(plain(chapters.map(c => c.key)),
    ['overview', 'lists', ...menu.NAV_SECTIONS.map(s => s.key)]);
  const inventory = chapters.find(c => c.key === 'inventory');
  const guide = tour.SECTION_GUIDES.inventory;
  assert.equal(inventory.steps.length, guide.groups.length + guide.workflows.length);
  // Шаг раздела раскрывает свой раздел меню и выделяет в нём ровно описанные пункты.
  for (const step of inventory.steps) {
    assert.equal(step.section, 'inventory');
    assert.ok(step.spot.length > 0);
  }
  const listed = inventory.steps.flatMap(s => s.items ?? []).length;
  assert.equal(listed, menu.NAV_SECTIONS.find(s => s.key === 'inventory').items.length);
});

test('screen without a group still shows up in the tour', () => {
  const { tour } = load();
  const sections = [{ key: 'admin', label: 'Администрирование', items: [
    { path: '/members', label: 'Участники' },
    { path: '/brand-new', label: 'Новый экран' },
  ] }];
  const chapter = tour.tourChapters(sections).find(c => c.key === 'admin');
  const labels = chapter.steps.flatMap(s => (s.items ?? []).map(i => i.label));
  assert.ok(labels.includes('Новый экран'));
});

test('progress is stored per account and organization and survives bad data', () => {
  const { env, tour } = load();
  assert.notEqual(tour.tourStorageKey('1:9'), tour.tourStorageKey('2:9'));
  assert.notEqual(tour.tourStorageKey('1:9'), tour.tourStorageKey('1:10'));

  const key = tour.tourStorageKey('1:9');
  assert.deepEqual(plain(tour.readProgress(key)), { seen: false, done: [] });
  tour.saveProgress(key, { seen: true, done: ['overview'] });
  assert.deepEqual(JSON.parse(env.storage.getItem(key)), { seen: true, done: ['overview'] });

  const fresh = load();
  fresh.env.storage.setItem(key, '{не json');
  assert.deepEqual(plain(fresh.tour.readProgress(key)), { seen: false, done: [] });
});

test('step counts are declined in Russian', () => {
  const { tour } = load();
  assert.deepEqual(plain([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 112].map(tour.stepsLabel)), [
    '1 шаг', '2 шага', '4 шага', '5 шагов', '11 шагов', '12 шагов', '14 шагов',
    '21 шаг', '22 шага', '25 шагов', '112 шагов',
  ]);
});
