import { json, preflight, readList, writeList, pushToBot } from '../_lib.js';

function authOk(context) {
  const token = context.env.ADMIN_TOKEN;
  const url = new URL(context.request.url);
  const auth =
    context.request.headers.get('x-admin-token') || url.searchParams.get('token') || '';
  return !!token && auth === token;
}

// 向单个订阅者推送，返回是否成功（2xx 视为成功）
async function sendOne(s, payload) {
  const st = await pushToBot(s.botUrl, payload);
  return st >= 200 && st < 300;
}

export async function onRequestOptions() {
  return preflight();
}

// 管理：发布内容到「指定频道」(立即) / 群发所有人(立即) / 创建定时群发
export async function onRequestPost(context) {
  if (!authOk(context)) return json({ error: 'unauthorized' }, 401);

  const body = await context.request.json().catch(() => ({}));
  if (!body.title) return json({ error: 'title required' }, 400);

  const subs = await readList('subscribers', []);

  // 创建定时群发（给所有人），保留作为"公告"能力
  if (body.schedule) {
    const pushes = await readList('pushes', []);
    const id = 'p_' + Date.now().toString(36);
    pushes.push({
      id,
      title: body.title,
      content: body.content || '',
      url: body.url || '',
      target: 'all',
      schedule: body.schedule,
      active: true,
      lastRun: 0,
      createdAt: Date.now(),
    });
    await writeList('pushes', pushes);
    return json({ ok: true, id });
  }

  // 发送到指定频道（只推给订阅该频道的人）
  if (body.channelId) {
    const targets = subs.filter(
      (s) => Array.isArray(s.channels) && s.channels.includes(body.channelId)
    );
    let sent = 0,
      failed = 0;
    for (const s of targets) {
      const ok = await sendOne(s, {
        title: body.title,
        content: body.content || '',
        url: body.url || '',
      });
      ok ? sent++ : failed++;
    }
    return json({ ok: true, sent, failed, total: targets.length });
  }

  // 群发所有人
  const targets = subs;
  let sent = 0,
    failed = 0;
  for (const s of targets) {
    const ok = await sendOne(s, {
      title: body.title,
      content: body.content || '',
      url: body.url || '',
    });
    ok ? sent++ : failed++;
  }
  return json({ ok: true, sent, failed, total: targets.length });
}

// 管理：列出定时群发
export async function onRequestGet(context) {
  if (!authOk(context)) return json({ error: 'unauthorized' }, 401);
  const pushes = await readList('pushes', []);
  return json(pushes);
}
