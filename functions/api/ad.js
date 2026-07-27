import { json, preflight, readList, writeList } from '../_lib.js';

// 底部广告：KV 存 { enabled:bool, html:string(JS/HTML 片段) }
const DEFAULT = { enabled: false, html: '' };

export async function onRequestOptions() {
  return preflight();
}

// 公开：页面渲染广告位时调用，仅返回“已启用时的片段”
export async function onRequestGet() {
  const cfg = await readList('ad_config', DEFAULT);
  return json({ enabled: !!cfg.enabled, html: cfg.enabled ? (cfg.html || '') : '' });
}

// 管理：设置广告片段 + 启用开关（需 ADMIN_TOKEN）
export async function onRequestPost(context) {
  const token = context.env.ADMIN_TOKEN;
  const url = new URL(context.request.url);
  const auth = context.request.headers.get('x-admin-token') || url.searchParams.get('token');
  if (!token || auth !== token) return json({ error: 'unauthorized' }, 401);

  const body = await context.request.json().catch(() => ({}));
  const html = typeof body.html === 'string' ? body.html : '';
  const enabled = !!body.enabled;
  await writeList('ad_config', { html, enabled });
  return json({ ok: true });
}
