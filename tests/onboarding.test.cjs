const test = require('node:test');
const assert = require('node:assert/strict');
const { runtime } = require('./load.cjs');
test('introduction includes only visible sections and stores acknowledgement per account/org', () => {
  const env = runtime();
  const { visibleSections } = env.load('src/layout/menu.ts');
  const { introductionSteps, tourStorageKey } = env.load('src/layout/onboarding.ts');
  const steps = introductionSteps(visibleSections(['customer.manage']));
  assert.ok(steps.some(s => s.selector === "[data-tour-section='menu']"));
  assert.ok(!steps.some(s => s.selector === "[data-tour-section='finance']"));
  assert.ok(!steps.some(s => s.selector === "[data-tour-section='admin']"));
  assert.notEqual(tourStorageKey('1:9'), tourStorageKey('2:9'));
  assert.notEqual(tourStorageKey('1:9'), tourStorageKey('1:10'));
});
