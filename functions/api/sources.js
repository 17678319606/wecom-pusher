import { json, preflight, readList, writeList } from '../_lib.js';

export async function onRequestOptions() {
  return preflight();
}

// 公开：返回源列表（含 url，供管理员编辑回填），以及健康状态
export async function onRequestGet() {
  const sources = await readList('sources', []);
  return json(
    sources.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category || '',
      url: s.url || '',
      suspect: !!s.suspect,
      failCount: s.failCount || 0,
      lastCheck: s.lastCheck || 0,
    }))
  );
}

// 管理：新增 RSS 源（需 ADMIN_TOKEN），可带分类标签
export async function onRequestPost(context) {
  const token = context.env.ADMIN_TOKEN;
  const url = new URL(context.request.url);
  const auth = context.request.headers.get('x-admin-token') || url.searchParams.get('token');
  if (!token || auth !== token) return json({ error: 'unauthorized' }, 401);

  const body = await context.request.json().catch(() => ({}));
  if (!body.name || !body.url) return json({ error: 'name & url required' }, 400);

  const sources = await readList('sources', []);
  const id = 's_' + Date.now().toString(36);
  sources.push({
    id,
    name: body.name,
    url: body.url,
    category: body.category || '',
    lastHash: '',
    createdAt: Date.now(),
  });
  await writeList('sources', sources);
  return json({ ok: true, id });
}

// 管理：编辑源（按 id 更新字段，未提供的字段保留原值）
export async function onRequestPut(context) {
  const token = context.env.ADMIN_TOKEN;
  const url = new URL(context.request.url);
  const auth = context.request.headers.get('x-admin-token') || url.searchParams.get('token');
  if (!token || auth !== token) return json({ error: 'unauthorized' }, 401);
  const id = url.searchParams.get('id');
  if (!id) return json({ error: 'id required' }, 400);
  const body = await context.request.json().catch(() => ({}));
  if (!body.name || !body.url) return json({ error: 'name & url required' }, 400);
  const sources = await readList('sources', []);
  const idx = sources.findIndex((s) => s.id === id);
  if (idx < 0) return json({ error: 'not found' }, 404);
  const cur = sources[idx];
  const next = {
    ...cur,
    name: String(body.name),
    url: String(body.url),
    category: body.category !== undefined ? String(body.category || '') : cur.category,
  };
  sources[idx] = next;
  await writeList('sources', sources);
  return json({ ok: true, id });
}

// 管理：删除源
export async function onRequestDelete(context) {
  const token = context.env.ADMIN_TOKEN;
  const url = new URL(context.request.url);
  const auth = context.request.headers.get('x-admin-token') || url.searchParams.get('token');
  if (!token || auth !== token) return json({ error: 'unauthorized' }, 401);
  const id = url.searchParams.get('id');
  let sources = await readList('sources', []);
  sources = sources.filter((s) => s.id !== id);
  await writeList('sources', sources);
  return json({ ok: true });
}
