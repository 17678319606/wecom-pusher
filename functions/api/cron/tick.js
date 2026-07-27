import {
  json,
  readList,
  writeList,
  pushToBot,
  pushMarkdown,
  parseRSS,
  lastOccurrence,
  stripTags,
  kwMatch,
  AD_FOOTER,
} from '../_lib.js';

// 北京时间（Asia/Shanghai）小时数 0-23
function shHour(now) {
  return new Date(now + 8 * 3600 * 1000).getUTCHours();
}

const inSilent = (h) => h >= 21 || h < 6; // 21:00 - 次日 06:00 静默
const digestDue = (h) => h >= 8; // 早 8 点发聚合早报

// 单条推送并累计统计
async function send(s, payload, stats) {
  const st = await pushToBot(s.botUrl, payload);
  const ok = st >= 200 && st < 300;
  if (stats) ok ? stats.ok++ : stats.fail++;
  return ok;
}

// 由 edgeone.json 的 schedules 每 5 分钟触发一次
// 负责：
//   1) RSS 轮询推送（夜间 21:00-06:00 静默，缓存为早报；其余时段即时推送；订阅者关键词过滤）
//   2) 定时群发（给所有人，不受静默影响）
//   3) 自定义内容频道定时推送（不受静默影响）
export async function onRequestPost() {
  const now = Date.now();
  const h = shHour(now);
  const silent = inSilent(h);
  const morning = digestDue(h);

  const sources = await readList('sources', []);
  const channels = await readList('channels', []);
  const subs = await readList('subscribers', []);

  let rssSent = 0;
  let rssFailed = 0;
  let digestSent = 0;
  let schedSent = 0;
  let chanSent = 0;

  // 1) RSS 轮询
  for (const src of sources) {
    src.stats = src.stats || { ok: 0, fail: 0 };
    try {
      const resp = await fetch(src.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 WeComPusher/1.0' },
      });
      if (!resp.ok) continue;
      const xml = await resp.text();
      const items = parseRSS(xml).slice(0, 5);
      if (!items.length) continue;
      const top = items[0];
      const topHash = top.title + '|' + top.link;
      if (topHash === src.lastHash) continue; // 无新内容

      const newItem = {
        title: top.title,
        link: top.link,
        description: stripTags(top.description),
      };
      src.lastHash = topHash;
      src.lastCheck = now;

      // 静默窗口：只缓存，不推送
      if (silent) {
        const buf = await readList('digest:' + src.id, []);
        buf.push(newItem);
        await writeList('digest:' + src.id, buf);
        continue;
      }

      // 日间：即时推送（订阅者关键词过滤）
      const targetSubs = subs.filter(
        (s) => Array.isArray(s.sources) && s.sources.includes(src.id)
      );
      for (const s of targetSubs) {
        if (!kwMatch(newItem, s.keywords)) continue;
        if (await send(s, {
          title: `[${src.name}] ${newItem.title}`,
          content: newItem.description,
          url: newItem.link,
        }, src.stats)) rssSent++;
        else rssFailed++;
      }
    } catch {
      /* ignore */
    }
  }
  await writeList('sources', sources);

  // 1b) 早报：早 8 点把夜间缓存的 RSS 更新聚合推送
  if (morning) {
    for (const src of sources) {
      const buf = await readList('digest:' + src.id, []);
      if (!buf.length) continue;
      const targetSubs = subs.filter(
        (s) => Array.isArray(s.sources) && s.sources.includes(src.id)
      );
      for (const s of targetSubs) {
        const items = buf.filter((it) => kwMatch(it, s.keywords));
        if (!items.length) continue;
        const lines = items
          .map((it) => `- [${it.title}](${it.link})`)
          .join('\n');
        const md = `## 早安 · 昨夜至今的更新\n来自《${src.name}》共 ${items.length} 条：\n${lines}${AD_FOOTER}`;
        const st = await pushMarkdown(s.botUrl, md, '早安播报');
        const ok = st >= 200 && st < 300;
        if (ok) {
          digestSent++;
          src.stats.ok++;
        } else {
          src.stats.fail++;
        }
      }
      await writeList('digest:' + src.id, []); // 清空缓存
    }
    await writeList('sources', sources);
  }

  // 2) 定时群发（给所有人，不受静默影响）
  const pushes = await readList('pushes', []);
  for (const p of pushes) {
    p.stats = p.stats || { ok: 0, fail: 0 };
    if (!p.active) continue;
    const occ = lastOccurrence(p, now);
    if (occ <= (p.lastRun || 0)) continue;
    const targets =
      p.target === 'all'
        ? subs
        : subs.filter((s) => Array.isArray(p.target) && p.target.includes(s.id));
    for (const s of targets) {
      const ok = await send(s, {
        title: p.title,
        content: p.content || '',
        url: p.url || '',
      }, p.stats);
      if (ok) schedSent++;
    }
    p.lastRun = occ;
  }
  await writeList('pushes', pushes);

  // 3) 自定义内容频道（按订阅 + 定时自动发送预设内容，不受静默影响）
  for (const c of channels) {
    c.stats = c.stats || { ok: 0, fail: 0 };
    if (!c.active || !c.schedule) continue;
    const occ = lastOccurrence(c, now);
    if (occ <= (c.lastRun || 0)) continue;
    const targets = subs.filter(
      (s) => Array.isArray(s.channels) && s.channels.includes(c.id)
    );
    for (const s of targets) {
      const ok = await send(s, {
        title: c.name,
        content: c.content || '',
        url: c.url || '',
      }, c.stats);
      if (ok) chanSent++;
    }
    c.lastRun = occ;
  }
  await writeList('channels', channels);

  return json({
    ok: true,
    silent,
    rssSent,
    rssFailed,
    digestSent,
    schedSent,
    chanSent,
    at: now,
  });
}
