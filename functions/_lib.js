// 共享工具：KV 读写、多平台机器人推送、RSS 解析、调度计算、CORS、哈希、限流、脱敏
// 注意：KV 是项目绑定后的全局变量，绑定变量名须设为 "KV"

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS,DELETE',
  'Access-Control-Allow-Headers': 'Content-Type,x-admin-token',
};

// 安全响应头（防御纵深）。
// 注意： deliberately 不设置 X-Frame-Options / CSP frame-ancestors，
// 以保留首页 ?widget=1 被其它网站 iframe 嵌入订阅的能力。
export const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
};

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...SEC_HEADERS, ...CORS },
  });

export const preflight = () => new Response(null, { status: 204, headers: { ...SEC_HEADERS, ...CORS } });

export async function readList(key, fallback = []) {
  const v = await KV.get(key);
  if (!v) return fallback;
  try {
    const p = JSON.parse(v);
    return Array.isArray(p) ? p : (typeof fallback === 'object' && !Array.isArray(fallback) ? p : fallback);
  } catch {
    return fallback;
  }
}

export async function writeList(key, val) {
  await KV.put(key, JSON.stringify(val));
}

export function simpleHash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

export const stripTags = (s) =>
  (s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 800);

// 固定赞助广告（追加到每条系统推送末尾；bookmark 个人工具可通过 noAd 关闭）
export const AD_FOOTER = '\n\n[赞助广告](https://jinbufenzi.com/go/5i7736)';

export function detectPlatform(url) {
  if (/qyapi\.weixin\.qq\.com/.test(url)) return 'wecom';
  if (/feishu/.test(url)) return 'feishu';
  if (/dingtalk/.test(url)) return 'dingtalk';
  return 'unknown';
}

// 机器人 Webhook 合法性校验（订阅与自检共用）
export const WEBHOOK_RE = /^https:\/\/(qyapi\.weixin\.qq\.com\/cgi-bin\/webhook\/send\?key=|open\.feishu\.(cn|com)\/open-apis\/bot\/v2\/hook\/|oapi\.dingtalk\.com\/robot\/send\?access_token=)/i;

// 把正文里的链接"盘活"：
//  - 保留 <a href="URL">TEXT</a> → [TEXT](URL)（先于通用标签剥离，避免 URL 丢失）
//  - 剥离其余 HTML 标签、还原常见实体
//  - 裸 URL（http/https/www.）包裹成 [URL](URL)，使飞书/钉钉/企微 markdown 均能渲染为可点链接
//  说明：飞书/钉钉 markdown 只认 [文字](url)；企微对 <a href> 兼容性最好（buildWebhookBody 会再转换）
export function linkify(raw) {
  if (!raw) return '';
  let s = String(raw);
  s = s.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (m, url, text) => {
    const t = (text || '').replace(/<[^>]*>/g, '').trim() || url;
    return `[${t}](${url})`;
  });
  s = s.replace(/<[^>]*>/g, ' ');
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/&hellip;/gi, '…');
  // 裸 URL（http/https）包裹为链接；前置字符限定为空白/标点，避免与已有的 [text](url) / (url) 重复包裹
  s = s.replace(/(^|[\s，。、；：,;:！？!?])(https?:\/\/[^\s<>"'）]+)/gi, (m, pre, url) => `${pre}[${url}](${url})`);
  s = s.replace(/(^|[\s，。、；：,;:！？!?])(www\.[^\s<>"'）]+)/gi, (m, pre, url) => `${pre}[${url}](http://${url})`);
  return s;
}

// 渲染标准 markdown 消息体（正文经 linkify 处理，链接可点；保留用户换行）
export function renderMarkdown({ title, content = '', url = '', digest = '' }, noAd = false) {
  let md = `## ${title}\n`;
  const raw = digest || content || '';
  const t = linkify(raw)
    .split('\n')
    .map((l) => l.trim())
    .filter((l, i, arr) => l !== '' || (arr[i - 1] !== '' && arr[i + 1] !== ''))
    .join('\n')
    .trim()
    .slice(0, 2000);
  if (t) md += '> ' + t.split('\n').join('\n> ') + '\n\n';
  if (url) md += `[查看原文](${url})`;
  if (!noAd) md += AD_FOOTER;
  return md;
}

// 把标准 markdown 链接 [text](url) 转成 <a href="url">text</a>
// 企业微信对 <a> 标签兼容性最好，避免其 markdown 内联链接被服务端降级为纯文本（飞书/钉钉原生支持 [text](url)，无需转换）
// 先 linkify 兜底：确保企微消息里任何裸 URL / 残留 <a> 也先变成 [text](url)，再统一转 <a href>
function mdToAnchor(md) {
  const linked = linkify(md);
  return linked.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi, (m, text, url) => `<a href="${url}">${text}</a>`);
}

// 纯函数：根据平台构造机器人请求体（可单测，不依赖网络）
export function buildWebhookBody(url, md, title = '通知') {
  const plat = detectPlatform(url);
  if (plat === 'wecom') return { platform: 'wecom', body: { msgtype: 'markdown', markdown: { content: mdToAnchor(md) } } };
  if (plat === 'feishu') return { platform: 'feishu', body: { msg_type: 'markdown', markdown: { title, content: md } } };
  if (plat === 'dingtalk') return { platform: 'dingtalk', body: { msgtype: 'markdown', markdown: { title, text: md } } };
  return { platform: 'unknown', body: { msgtype: 'markdown', markdown: { content: mdToAnchor(md) } } };
}

// 直接发送一段 markdown（早报等自定义排版用）
export async function pushMarkdown(botUrl, md, title = '通知', attempts = 2) {
  const { body } = buildWebhookBody(botUrl, md, title);
  let last = 500;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(botUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (r.status >= 200 && r.status < 300) return r.status;
      last = r.status;
    } catch {
      last = 0;
    }
  }
  return last;
}

// 标准推送（渲染 + 发送 + 重试一次）；noAd=true 时不追加赞助广告（个人收藏工具用）
export async function pushToBot(botUrl, payload, attempts = 2, noAd = false) {
  return pushMarkdown(botUrl, renderMarkdown(payload, noAd), payload.title, attempts);
}

// 机器人地址脱敏（后台展示用）
export function maskBot(url) {
  try {
    const u = new URL(url);
    const q = u.searchParams.get('key') || u.searchParams.get('access_token') || '';
    const tail = q.length > 4 ? q.slice(-4) : '';
    return u.origin + u.pathname + (tail ? '?...' + tail : '?...');
  } catch {
    return url.slice(0, 24) + '...';
  }
}

// IP 限流：按 小时 计数，超过 max 返回 true（限流）。键含小时自动滚动。
export async function rateLimited(ip, key, max) {
  const hour = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 13);
  const k = `rl:${key}:${ip}:${hour}`;
  const v = await KV.get(k);
  let n = v ? parseInt(v, 10) : 0;
  if (n >= max) return true;
  await KV.put(k, String(n + 1));
  return false;
}

export function clientIp(request) {
  const x = request.headers.get('x-forwarded-for');
  if (x) return x.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

// 极简 RSS 2.0 / Atom 解析
export function parseRSS(xml) {
  const items = [];
  const itemRe = /<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[0];
    const get = (tag) => {
      const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
      const mm = block.match(r);
      let v = mm ? mm[1] : '';
      v = v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
      return v.trim();
    };
    let link = get('link');
    if (!link) {
      const lr = block.match(/<link[^>]*href="([^"]*)"[^>]*\/?>/i);
      if (lr) link = lr[1];
    }
    items.push({
      title: get('title'),
      link,
      description: get('description') || get('summary'),
      pubDate: get('pubDate') || get('updated'),
    });
  }
  return items.filter((i) => i.title && i.link);
}

// 关键词匹配（订阅者自设；为空则全过）
export function kwMatch(item, kws) {
  if (!kws || !kws.length) return true;
  const t = ((item.title || '') + ' ' + (item.description || '')).toLowerCase();
  return kws.some((k) => t.includes(k.toLowerCase()));
}

// —— 留存度量：连续服务天数 & 月度聚合（零成本，KV 单值，写频可控）——
// 北京时间日期 YYYY-MM-DD
export function shDate(now) {
  return new Date(now + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

// 连续服务天数：cron 每天跑即推进；断更（服务挂了一天）则归 1。约 1 写/天。
export async function bumpStreak() {
  const t = shDate(Date.now());
  const s = await readList('streak', { count: 0, lastDate: '' });
  const last = s.lastDate || '';
  if (last === t) return s; // 今天已记，不重复写
  const y = new Date(Date.now() + 8 * 3600 * 1000 - 86400000).toISOString().slice(0, 10);
  const count = last === y ? (s.count || 0) + 1 : 1;
  const nv = { count, lastDate: t };
  await writeList('streak', nv);
  return nv;
}

// 月度聚合：digest/sched/chan/rss/bookmark 计数。仅在 deltas 有值时调用（读改写一次）。
export async function bumpMonthly(delta) {
  const m = shDate(Date.now()).slice(0, 7); // YYYY-MM
  const k = 'mstat:' + m;
  const cur = await readList(k, { digest: 0, sched: 0, chan: 0, rss: 0, bookmark: 0 });
  cur.digest += delta.digest || 0;
  cur.sched += delta.sched || 0;
  cur.chan += delta.chan || 0;
  cur.rss += delta.rss || 0;
  cur.bookmark += delta.bookmark || 0;
  await writeList(k, cur);
  return cur;
}

// 零成本站点埋点：每日聚合计数器（KV 单值，配合前端采样控制写频）
// 事件：pv 页面浏览(采样) / uv 独立访客(每日去重) / widget 被嵌入 / sub 订阅 / unsub 退订
export async function bumpTrack(event) {
  const d = shDate(Date.now());
  const k = 'track:' + d;
  const cur = await readList(k, { pv: 0, uv: 0, widget: 0, sub: 0, unsub: 0 });
  if (event in cur) cur[event] += 1;
  await writeList(k, cur);
  return cur;
}

// 计算某个定时规则在 Asia/Shanghai 的"上一次发生时刻"
export function lastOccurrence(p, now) {
  const off = 8 * 3600 * 1000;
  const sh = new Date(now + off);
  const Y = sh.getUTCFullYear();
  const M = sh.getUTCMonth() + 1;
  const D = sh.getUTCDate();
  const s = p.schedule || {};
  const mk = (yy, mm, dd, hh, mi) => Date.UTC(yy, mm - 1, dd, hh, mi) - off;
  if (s.type === 'daily') {
    const base = mk(Y, M, D, s.hour, s.minute);
    return base <= now ? base : base - 86400000;
  }
  if (s.type === 'weekly') {
    const todayDow = sh.getUTCDay();
    let diff = todayDow - (s.dow ?? 0);
    if (diff < 0) diff += 7;
    const base = mk(Y, M, D, s.hour, s.minute) - diff * 86400000;
    return base <= now ? base : base - 7 * 86400000;
  }
  if (s.type === 'monthly') {
    const base = mk(Y, M, s.dom, s.hour, s.minute);
    if (base <= now) return base;
    const pm = new Date(Date.UTC(Y, M - 2, 1));
    return mk(pm.getUTCFullYear(), pm.getUTCMonth() + 1, s.dom, s.hour, s.minute);
  }
  if (s.type === 'yearly') {
    const base = mk(Y, s.month, s.date, s.hour, s.minute);
    if (base <= now) return base;
    return mk(Y - 1, s.month, s.date, s.hour, s.minute);
  }
  return 0;
}
