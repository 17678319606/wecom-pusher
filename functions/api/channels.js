import { json, preflight, readList, writeList } from '../_lib.js';

export async function onRequestOptions() {
  return preflight();
}

// 公开：返回自定义内容频道列表（id + name + category），供订阅页勾选
export async function onRequestGet() {
  const channels = await readList('channels', []);
  return json(channels.map((c) => ({ id: c.id, name: c.name, category: c.category || '' })));
}

// 管理：新增自定义内容频道（可带定时与预设内容）
export async function onRequestPost(context) {
  const token = context.env.ADMIN_TOKEN;
  const url = new URL(context.request.url);
  const auth = context.request.headers.get('x-admin-token') || url.searchParams.get('token');
  if (!token || auth !== token) return json({ error: 'unauthorized' }, 401);

  const body = await context.request.json().catch(() => ({}));
  if (!body.name) return json({ error: 'name required' }, 400);

  const channels = await readList('channels', []);
  const id = 'c_' + Date.now().toString(36);
  channels.push({
    id,
    name: body.name,
    category: body.category || '',
    schedule: body.schedule || null, // 可选：{type,hour,minute,dow?,dom?,month?,date?}
    content: body.content || '', // 定时自动发送时使用的预设内容
    url: body.url || '',
    active: true,
    lastRun: 0,
    createdAt: Date.now(),
  });
  await writeList('channels', channels);
  return json({ ok: true, id });
}

// 管理：删除频道
export async function onRequestDelete(context) {
  const token = context.env.ADMIN_TOKEN;
  const url = new URL(context.request.url);
  const auth = context.request.headers.get('x-admin-token') || url.searchParams.get('token');
  if (!token || auth !== token) return json({ error: 'unauthorized' }, 401);
  const id = url.searchParams.get('id');
  let channels = await readList('channels', []);
  channels = channels.filter((c) => c.id !== id);
  await writeList('channels', channels);
  return json({ ok: true });
}
