const test = require('node:test');
const assert = require('node:assert/strict');
const { runtime } = require('./load.cjs');

test('expired token is refreshed for the profile /auth/me, never for login or password calls', () => {
  const api = { interceptors: { request: { use() {} }, response: { use() {} } }, defaults: {} };
  const axios = { create: () => api, post() {}, isAxiosError: () => false };
  const env = runtime({ axios: { __esModule: true, default: axios, CanceledError: class extends Error {} },
    '@/telemetry': { reportClientError() {} } });
  const { refreshable } = env.load('src/api/client.ts');
  // Профиль грузится первым на каждой странице: протухший токен здесь обновляется.
  assert.equal(refreshable('/auth/me'), true);
  assert.equal(refreshable('/me/capabilities'), true);
  assert.equal(refreshable('/orders'), true);
  // 401 тут — «неверные данные»: обновлять токен и выкидывать из сессии нельзя.
  for (const url of ['/auth/login', '/auth/refresh', '/auth/logout', '/auth/change-password',
    '/auth/forgot-password', '/auth/reset-password', '/auth/register'])
    assert.equal(refreshable(url), false, url);
});
