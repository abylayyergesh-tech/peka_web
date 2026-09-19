const test = require('node:test');
const assert = require('node:assert/strict');
const { runtime } = require('./load.cjs');

test('logout and new login clear cached identity; token rotation preserves it', () => {
  const env = runtime();
  const { useAuthStore } = env.load('src/auth/store.ts');
  const session = env.load('src/session.ts');
  useAuthStore.getState().setTokens('a', 'refresh-a');
  session.queryClient.setQueryData(['me'], { id: 'a' });
  useAuthStore.getState().setMe({ user_id: 1, customer_user_id: 1 });
  const signal = session.sessionSignal();
  useAuthStore.getState().rotateTokens('a2', 'refresh-a2');
  assert.equal(session.queryClient.getQueryData(['me']).id, 'a');
  assert.equal(signal.aborted, false);
  useAuthStore.getState().logout();
  assert.equal(signal.aborted, true);
  assert.equal(session.queryClient.getQueryData(['me']), undefined);
  useAuthStore.getState().setTokens('b', 'refresh-b');
  assert.equal(useAuthStore.getState().me, null);
  assert.equal(session.queryClient.getQueryCache().getAll().length, 0);
});

test('session replacement in another tab clears profile and cache', () => {
  const env = runtime();
  const { useAuthStore } = env.load('src/auth/store.ts');
  const { queryClient } = env.load('src/session.ts');
  useAuthStore.getState().setTokens('a', 'refresh-a');
  useAuthStore.getState().setMe({ user_id: 1, customer_user_id: 1 });
  queryClient.setQueryData(['private'], 'old');
  const key = useAuthStore.persist.getOptions().name;
  env.storage.setItem(key, JSON.stringify({ state: { token: 'b', refreshToken: 'refresh-b', activeOrgId: 2 }, version: 0 }));
  env.listeners.storage({ key });
  assert.equal(useAuthStore.getState().token, 'b');
  assert.equal(useAuthStore.getState().me, null);
  assert.equal(queryClient.getQueryData(['private']), undefined);
});

test('late refresh cannot resurrect or replace a new session', async () => {
  let resolveRefresh;
  let responseError;
  let request;
  class CanceledError extends Error {}
  const api = { interceptors: {
    request: { use: fn => { request = fn; } },
    response: { use: (_success, error) => { responseError = error; } },
  }, request: async () => ({ data: 'retry' }) };
  const axios = { create: () => api, post: () => new Promise(resolve => { resolveRefresh = resolve; }),
    isAxiosError: e => e?.isAxiosError === true };
  const env = runtime({ axios: { __esModule: true, default: axios, CanceledError },
    '@/telemetry': { reportClientError() {} } });
  const { useAuthStore } = env.load('src/auth/store.ts');
  env.load('src/api/client.ts');
  useAuthStore.getState().setTokens('a', 'refresh-a');
  const cfg = request({ headers: {}, url: '/protected' });
  const pending = responseError({ config: cfg, response: { status: 401, headers: {} } });
  const rejection = assert.rejects(pending, /Session changed/);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(typeof resolveRefresh, 'function');
  useAuthStore.getState().logout();
  useAuthStore.getState().setTokens('b', 'refresh-b');
  resolveRefresh({ data: { access_token: 'stale-a', refresh_token: 'stale-refresh' } });
  await rejection;
  assert.equal(useAuthStore.getState().token, 'b');
});
