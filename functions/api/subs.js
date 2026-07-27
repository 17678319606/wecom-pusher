import { json, preflight, readList, writeList, maskBot, detectPlatform } from '../_lib.js';

function authOk(context) {
  const token = context.env.ADMIN_TOKEN;
  const url = new URL(context.request.url);
  const auth =
    context.request.headers.get('x-admin-token') || url.searchParams.get('token') || '';
  return !!token && auth === token;
}

export async function onRequestOptions() {
  return preflight();
}

// 管理：列出订阅（机器人地址脱敏，看不到完整 key）
export async function onRequestGet(context) {
  if (!authOk(context)) return json({ error: 'unauthorized' }, 401);
  const subs = await readList('subscribers', []);
  const out = subs.map((s) => ({
    id: s.id,
    bot: maskBot(s.botUrl || ''),
    platform: detectPlatform(s.botUrl || ''),
    createdAt: s.createdAt || 0,
    sources: Array.isArray(s.sources) ? s.sources.length : 0,
    channels: Array.isArray(s.channels) ? s.channels.length : 0,
    keywords: s.keywords || [],
  }));
  return json({ count: out.length, subs: out });
}

// 管理：删除指定订阅
export async function onRequestDelete(context) {
  if (!authOk(context)) return json({ error: 'unauthorized' }, 401);
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');
  if (!id) return json({ error: 'id required' }, 400);
  let subs = await readList('subscribers', []);
  const before = subs.length;
  subs = subs.filter((s) => s.id !== id);
  if (subs.length === before) return json({ error: 'not found' }, 404);
  await writeList('subscribers', subs);
  return json({ ok: true, count: subs.length });
}
