// 共享工具：KV 读写、多平台机器人推送、RSS 解析、调度计算、CORS、哈希、限流、脱敏
// 注意：KV 是项目绑定后的全局变量，绑定变量名须设为 "KV"

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS,DELETE',
  'Access-Control-Allow-Headers': 'Content-Type,x-admin-token',
};

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });

export const preflight = () => new Response(null, { status: 204, headers: CORS });

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

// 渲染标准 markdown 消息体（保留用户换行，仅剥离 HTML 标签/实体）
export function renderMarkdown({ title, content = '', url = '', digest = '' }, noAd = false) {
  let md = `## ${title}\n`;
  const raw = digest || content || '';
  // 剥 HTML 标签与实体，压缩空格/制表符，但保留换行（多行内容逐行渲染为引号行）
  const t = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
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

// 直接发送一段 markdown（早报等自定义排版用）
export async function pushMarkdown(botUrl, md, title = '通知', attempts = 2) {
  const plat = detectPlatform(botUrl);
  let body;
  if (plat === 'wecom') body = { msgtype: 'markdown', markdown: { content: md } };
  else if (plat === 'feishu') body = { msg_type: 'markdown', markdown: { title, content: md } };
  else if (plat === 'dingtalk') body = { msgtype: 'markdown', markdown: { title, text: md } };
  else body = { msgtype: 'markdown', markdown: { content: md } };
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
