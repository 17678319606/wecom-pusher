// 后端编辑端点单测：channels / sources 的 onRequestPut
// 运行：npm test  (即 node --test tests/)
import { test } from 'node:test';
import assert from 'node:assert/strict';

class MockKV {
  constructor() { this.m = new Map(); }
  async get(k) { return this.m.has(k) ? this.m.get(k) : null; }
  async put(k, v) { this.m.set(k, v); }
  async delete(k) { this.m.delete(k); }
}
globalThis.KV = new MockKV();

const channelsMod = await import('../functions/api/channels.js');
const sourcesMod = await import('../functions/api/sources.js');

const getChannels = async () => (await channelsMod.onRequestGet()).json();
const getSources = async () => (await sourcesMod.onRequestGet()).json();

function mkCtx(method, { token, id, body, envToken = 'secret' } = {}) {
  const q = [];
  if (id) q.push('id=' + encodeURIComponent(id));
  if (token) q.push('token=' + encodeURIComponent(token));
  const url = 'https://x.com/api/x' + (q.length ? '?' + q.join('&') : '');
  return {
    env: { ADMIN_TOKEN: envToken },
    request: { url, headers: { get: () => null }, json: async () => body },
  };
}

test('channels PUT: 未授权返回 401', async () => {
  const r = await channelsMod.onRequestPut(mkCtx('PUT', { id: 'c_1', body: { name: 'x' } }));
  assert.equal(r.status, 401);
});

test('channels PUT: 更新字段成功且保留未提供字段', async () => {
  await channelsMod.onRequestPost(mkCtx('POST', { token: 'secret', body: { name: '原', category: 'a', content: 'c' } }));
  const id = (await getChannels())[0].id;
  const r = await channelsMod.onRequestPut(mkCtx('PUT', { token: 'secret', id, body: { name: '新', category: 'b' } }));
  assert.equal(r.status, 200);
  const after = (await getChannels())[0];
  assert.equal(after.name, '新');
  assert.equal(after.category, 'b');
  assert.equal(after.content, 'c');
});

test('channels PUT: 不存在返回 404', async () => {
  const r = await channelsMod.onRequestPut(mkCtx('PUT', { token: 'secret', id: 'nope', body: { name: 'x' } }));
  assert.equal(r.status, 404);
});

test('sources PUT: 更新成功且保留未提供字段', async () => {
  await sourcesMod.onRequestPost(mkCtx('POST', { token: 'secret', body: { name: 'S', url: 'https://a.com/f', category: 'cat' } }));
  const id = (await getSources())[0].id;
  const r = await sourcesMod.onRequestPut(mkCtx('PUT', { token: 'secret', id, body: { name: 'S2', url: 'https://b.com/f' } }));
  assert.equal(r.status, 200);
  const after = (await getSources())[0];
  assert.equal(after.name, 'S2');
  assert.equal(after.url, 'https://b.com/f');
  assert.equal(after.category, 'cat');
});

test('sources PUT: 缺少 name/url 返回 400', async () => {
  await sourcesMod.onRequestPost(mkCtx('POST', { token: 'secret', body: { name: 'S', url: 'https://a.com/f' } }));
  const id = (await getSources())[0].id;
  const r = await sourcesMod.onRequestPut(mkCtx('PUT', { token: 'secret', id, body: { name: '' } }));
  assert.equal(r.status, 400);
});
