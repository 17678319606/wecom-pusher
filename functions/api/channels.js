import { json, preflight, readList, writeList } from '../_lib.js';

export async function onRequestOptions() {
  return preflight();
}

// 公开：返回频道列表（含编辑所需的完整字段），供订阅页勾选与管理员编辑回填
export async function onRequestGet() {
  const channels = await readList('channels', []);
  return json(channels.map((c) => ({
    id: c.id,
    name: c.name,
    category: c.category || '',
    schedule: c.schedule || null,
    content: c.content || '',
    url: c.url || '',
    active: c.active !== false,
    lastRun: c.lastRun || 0,
    createdAt: c.createdAt || 0,
  })));
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

// 管理：编辑频道（按 id 更新字段，未提供的字段保留原值）
export async function onRequestPut(context) {
  const token = context.env.ADMIN_TOKEN;
  const url = new URL(context.request.url);
  const auth = context.request.headers.get('x-admin-token') || url.searchParams.get('token');
  if (!token || auth !== token) return json({ error: 'unauthorized' }, 401);
  const id = url.searchParams.get('id');
  if (!id) return json({ error: 'id required' }, 400);
  const body = await context.request.json().catch(() => ({}));
  const channels = await readList('channels', []);
  const idx = channels.findIndex((c) => c.id === id);
  if (idx < 0) return json({ error: 'not found' }, 404);
  const cur = channels[idx];
  const next = {
    ...cur,
    name: body.name !== undefined ? String(body.name) : cur.name,
    category: body.category !== undefined ? String(body.category || '') : cur.category,
    schedule: body.schedule !== undefined ? body.schedule : cur.schedule,
    content: body.content !== undefined ? String(body.content || '') : cur.content,
    url: body.url !== undefined ? String(body.url || '') : cur.url,
    active: body.active !== undefined ? !!body.active : cur.active,
  };
  channels[idx] = next;
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
