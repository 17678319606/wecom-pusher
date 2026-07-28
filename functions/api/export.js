import { json, preflight, readList } from '../_lib.js';

export async function onRequestOptions() {
  return preflight();
}

// 管理：导出全部配置为 JSON（源/频道/定时群发/广告），便于备份与迁移
export async function onRequestGet(context) {
  const token = context.env.ADMIN_TOKEN;
  const url = new URL(context.request.url);
  const auth = context.request.headers.get('x-admin-token') || url.searchParams.get('token');
  if (!token || auth !== token) return json({ error: 'unauthorized' }, 401);
  const data = {
    version: 1,
    exportedAt: Date.now(),
    sources: await readList('sources', []),
    channels: await readList('channels', []),
    pushes: await readList('pushes', []),
    ad: await readList('ad_config', {}),
  };
  return json(data);
}
