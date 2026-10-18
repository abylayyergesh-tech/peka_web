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

// Главы раздела — по одной на группу экранов; у раздела из одной группы
// ключ главы — просто ключ раздела.
const chapterKeys = (tour, section) => {
  const groups = tour.SECTION_GUIDES[section.key].groups;
  return groups.length === 1 ? [section.key] : groups.map((_, i) => `${section.key}:${i}`);
};

test('full access gets a chapter per screen group with its how-tos', () => {
  const { menu, tour } = load();
  const chapters = tour.tourChapters(menu.visibleSections(ALL_CAPS(menu)));
  assert.deepEqual(plain(chapters.map(c => c.key)),
    ['overview', 'lists', ...menu.NAV_SECTIONS.flatMap(s => chapterKeys(tour, s))]);
  const inventory = chapters.filter(c => c.key.startsWith('inventory:'));
  const guide = tour.SECTION_GUIDES.inventory;
  const label = menu.NAV_SECTIONS.find(s => s.key === 'inventory').label;
  assert.equal(inventory.length, guide.groups.length);
  assert.equal(inventory.flatMap(c => c.steps).length, guide.groups.length + guide.workflows.length);
  inventory.forEach((chapter, i) => {
    assert.equal(chapter.title, `${label}: ${guide.groups[i].title}`);
    // Первый шаг — обзор группы, дальше — инструкции только к её экранам.
    assert.deepEqual(plain(chapter.steps[0].spot), plain(guide.groups[i].paths));
    for (const step of chapter.steps.slice(1)) {
      assert.ok(guide.groups[i].paths.includes(step.link.path));
    }
    // Шаг раскрывает свой раздел меню и выделяет в нём описанные пункты.
    for (const step of chapter.steps) {
      assert.equal(step.section, 'inventory');
      assert.ok(step.spot.length > 0);
    }
  });
  const listed = inventory.flatMap(c => c.steps).flatMap(s => s.items ?? []).length;
  assert.equal(listed, menu.NAV_SECTIONS.find(s => s.key === 'inventory').items.length);
});

test('every how-to lands in exactly one chapter and chapters stay short', () => {
  const { menu, tour } = load();
  const chapters = tour.tourChapters(menu.visibleSections(ALL_CAPS(menu)));
  const howtos = chapters.flatMap(c => c.steps).filter(s => s.howto);
  const total = Object.values(tour.SECTION_GUIDES).reduce((n, g) => n + g.workflows.length, 0);
  assert.equal(howtos.length, total);
  for (const chapter of chapters) {
    assert.ok(chapter.steps.length <= 20, `глава «${chapter.title}» — ${chapter.steps.length} шагов`);
  }
  const titles = Object.values(tour.SECTION_GUIDES).flatMap(g => g.workflows.map(w => `${w.path} ${w.title}`));
  assert.equal(new Set(titles).size, titles.length, 'инструкция повторяется на одном экране');
});

test('a section seen through one group is a single chapter named after the section', () => {
  const { menu, tour } = load();
  const chapters = tour.tourChapters(menu.visibleSections(['request.policy.manage']));
  const hr = chapters.filter(c => c.key.startsWith('hr'));
  assert.equal(hr.length, 1);
  assert.equal(hr[0].title, 'HR');
  assert.equal(hr[0].summary, tour.SECTION_GUIDES.hr.summary);
});

test('screen without a group still shows up in the tour', () => {
  const { tour } = load();
  const sections = [{ key: 'admin', label: 'Администрирование', items: [
    { path: '/members', label: 'Участники' },
    { path: '/brand-new', label: 'Новый экран' },
  ] }];
  const chapters = tour.tourChapters(sections).filter(c => c.key.startsWith('admin'));
  const labels = chapters.flatMap(c => c.steps).flatMap(s => (s.items ?? []).map(i => i.label));
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
