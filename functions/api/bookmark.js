import {
  json,
  preflight,
  pushToBot,
  rateLimited,
  clientIp,
  readList,
  writeList,
  bumpMonthly,
} from '../_lib.js';

// 支持 企业微信 / 飞书 / 钉钉 机器人
const WEBHOOK_RE = /^https:\/\/(qyapi\.weixin\.qq\.com\/cgi-bin\/webhook\/send\?key=|open\.feishu\.(cn|com)\/open-apis\/bot\/v2\/hook\/|oapi\.dingtalk\.com\/robot\/send\?access_token=)/i;

export async function onRequestOptions() {
  return preflight();
}

// 收藏列表（管理员）：支持 ?tag= 过滤；不暴露机器人地址
export async function onRequestGet(context) {
  const token = context.env.ADMIN_TOKEN;
  const url = new URL(context.request.url);
  const auth = context.request.headers.get('x-admin-token') || url.searchParams.get('token');
  if (!token || auth !== token) return json({ error: 'unauthorized' }, 401);
  const list = await readList('bookmarks', []);
  const tag = (url.searchParams.get('tag') || '').trim();
  const out = tag ? list.filter((b) => Array.isArray(b.tags) && b.tags.includes(tag)) : list;
  const tags = [...new Set(list.flatMap((b) => b.tags || []))];
  return json({ count: out.length, bookmarks: out, tags });
}

// 删除单条收藏（管理员）
export async function onRequestDelete(context) {
  const token = context.env.ADMIN_TOKEN;
  const url = new URL(context.request.url);
  const auth = context.request.headers.get('x-admin-token') || url.searchParams.get('token');
  if (!token || auth !== token) return json({ error: 'unauthorized' }, 401);
  const id = url.searchParams.get('id');
  let list = await readList('bookmarks', []);
  const before = list.length;
  list = list.filter((b) => b.id !== id);
  if (list.length === before) return json({ error: 'not found' }, 404);
  await writeList('bookmarks', list);
  return json({ ok: true });
}

// 收藏推送：任何人填自己的机器人链接 + 标题/链接，立即推给自己。
// 同时把收藏落库（"第二大脑"，有界 200 条），便于在后台按标签检索。
export async function onRequestPost(context) {
  const { request } = context;
  // 防刷：每 IP 每小时最多 50 次
  if (await rateLimited(clientIp(request), 'bm', 50)) {
    return json({ error: '操作过于频繁，请稍后再试' }, 429);
  }
  const body = await request.json().catch(() => ({}));
  const botUrl = (body.botUrl || '').trim();
  const title = (body.title || '').trim();
  const tags = Array.isArray(body.tags)
    ? body.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 10)
    : [];
  if (!WEBHOOK_RE.test(botUrl)) {
    return json({ error: '请填写合法的机器人 Webhook（支持企业微信 / 飞书 / 钉钉）' }, 400);
  }
  if (!title) {
    return json({ error: '标题不能为空' }, 400);
  }
  const st = await pushToBot(
    botUrl,
    {
      title,
      content: (body.content || '').trim(),
      url: (body.url || '').trim(),
    },
    2,
    true // 个人收藏工具不加赞助广告
  );
  if (st >= 200 && st < 300) {
    await saveBookmark({
      title,
      content: (body.content || '').trim(),
      url: (body.url || '').trim(),
      tags,
    });
    await bumpMonthly({ bookmark: 1 });
    return json({ ok: true });
  }
  return json({ error: '推送失败，请检查机器人链接是否有效', code: st }, 502);
}

// 落库收藏（不存机器人地址，避免泄露；有界 200 条防 25MB 单值上限）
async function saveBookmark({ title, content, url, tags }) {
  const list = await readList('bookmarks', []);
  list.unshift({
    id: 'b_' + Date.now().toString(36),
    title,
    content,
    url,
    tags: tags || [],
    ts: Date.now(),
  });
  if (list.length > 200) list.length = 200;
  await writeList('bookmarks', list);
}
