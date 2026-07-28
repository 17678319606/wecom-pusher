import { json, preflight, readList, writeList, simpleHash, rateLimited, clientIp, bumpTrack } from '../_lib.js';

const WEBHOOK_RE = /^https:\/\/(qyapi\.weixin\.qq\.com\/cgi-bin\/webhook\/send\?key=|open\.feishu\.(cn|com)\/open-apis\/bot\/v2\/hook\/|oapi\.dingtalk\.com\/robot\/send\?access_token=)/i;
const WARN_SIZE = 22 * 1024 * 1024;
const WARN_COUNT = 90000;

export async function onRequestOptions() {
  return preflight();
}

// 公开订阅：自己的机器人 URL + 勾选 RSS 源/频道 + 可选关键词
export async function onRequestPost(context) {
  const { request } = context;
  if (await rateLimited(clientIp(request), 'sub', 30)) {
    return json({ error: '操作过于频繁，请稍后再试' }, 429);
  }
  const body = await request.json().catch(() => ({}));
  const botUrl = (body.botUrl || '').trim();
  if (!WEBHOOK_RE.test(botUrl)) {
    return json({ error: '请填写合法的机器人 Webhook（支持企业微信 / 飞书 / 钉钉）' }, 400);
  }
  const sources = Array.isArray(body.sources) ? body.sources : [];
  const channels = Array.isArray(body.channels) ? body.channels : [];
  const keywords = Array.isArray(body.keywords)
    ? body.keywords.map((k) => String(k).trim()).filter(Boolean).slice(0, 10)
    : [];
  const topics = Array.isArray(body.topics) ? body.topics : [];
  const subs = await readList('subscribers', []);
  const id = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const token = simpleHash(id + botUrl);
  subs.push({ id, token, botUrl, sources, channels, keywords, topics, createdAt: Date.now() });
  await writeList('subscribers', subs);

  const size = JSON.stringify(subs).length;
  const warn =
    size > WARN_SIZE || subs.length > WARN_COUNT
      ? '订阅者数据已接近 KV 单值 25MB 上限，继续增长建议做分片或外置数据库'
      : null;
  try { await bumpTrack('sub'); } catch (_) {}
  return json({ ok: true, id, count: subs.length, warn });
}

// GET：返回订阅人数；或 ?id=&token= 退订
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');
  const token = url.searchParams.get('token');
  if (id && token) {
    let subs = await readList('subscribers', []);
    const hit = subs.find((s) => s.id === id);
    if (!hit || hit.token !== token) return json({ error: '无效退订链接' }, 400);
    subs = subs.filter((s) => s.id !== id);
    await writeList('subscribers', subs);
    try { await bumpTrack('unsub'); } catch (_) {}
    return json({ ok: true, count: subs.length });
  }
  const subs = await readList('subscribers', []);
  return json({ count: subs.length });
}
