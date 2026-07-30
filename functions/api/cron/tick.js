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
  shDate,
  bumpStreak,
  bumpMonthly,
} from '../../_lib.js';

// 由 edgeone.json 的 schedules 每 2 小时触发一次（cron: 0 */2 * * *）

// 单条推送并累计统计
async function send(s, payload, stats) {
  const st = await pushToBot(s.botUrl, payload);
  const ok = st >= 200 && st < 300;
  if (stats) ok ? stats.ok++ : stats.fail++;
  return ok;
}

// 抓取成功 → 解除疑似失效，记最后检查时间
function recover(src, now) {
  src.failCount = 0;
  src.suspect = false;
  src.lastCheck = now;
}
// 抓取失败 → 连败计数，达阈值标记疑似失效（暂停推送，避免打扰）
function markFail(src, now) {
  src.failCount = (src.failCount || 0) + 1;
  src.suspect = src.failCount >= 5;
  src.lastCheck = now;
}

// 由 edgeone.json 的 schedules 每 2 小时触发一次（cron: 0 */2 * * *）
// 负责：
//   1) RSS 每小时汇总推送（标题+链接，节省资源；订阅者关键词过滤）
//   2) 定时群发（给所有人）
//   3) 自定义内容频道定时推送
//   附加：连续服务天数 / 月度聚合度量；RSS 源失效自愈
export async function onRequestPost() {
  const now = Date.now();

  // 连续服务天数：cron 每次跑即视为"服务在线"一天（断更归 1）
  await bumpStreak();
  // 记录最近一次 tick 时间，供 /api/health 判断定时任务是否存活（排查"不推送"用）
  await KV.put('lastTick', String(now));

  const sources = await readList('sources', []);
  const channels = await readList('channels', []);
  const subs = await readList('subscribers', []);

  let rssSent = 0;
  let rssFailed = 0;
  let digestSent = 0;
  let schedSent = 0;
  let chanSent = 0;

  // 1) RSS 每 2 小时汇总：抓取所有源，收集本周期内的新条目，一次性发送（仅标题+链接，节省资源）
  const rssBuffer = [];
  for (const src of sources) {
    src.stats = src.stats || { ok: 0, fail: 0 };
    src.failCount = src.failCount || 0;
    try {
      const resp = await fetch(src.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 WeComPusher/1.0' },
      });
      if (!resp.ok) {
        markFail(src, now);
        continue;
      }
      const xml = await resp.text();
      const items = parseRSS(xml).slice(0, 10);
      if (!items.length) {
        recover(src, now); // 可达但空，不算失败
        continue;
      }
      src.seen = src.seen || [];
      const newItems = items.filter((it) => !src.seen.includes(it.link));
      if (!newItems.length) {
        recover(src, now); // 无新内容，可达正常
        continue;
      }
      // 记录已见链接（保留最近 50 条，避免重复推送 & 无限增长）
      for (const it of newItems) src.seen.push(it.link);
      src.seen = src.seen.slice(-50);
      recover(src, now); // 抓取成功 → 解除疑似失效

      for (const it of newItems) {
        rssBuffer.push({ srcId: src.id, item: it });
      }
    } catch {
      markFail(src, now);
    }
  }
  await writeList('sources', sources);

  // 发送：每个订阅者一条汇总（仅含其订阅源 + 关键词命中），每条只含标题+链接
  if (rssBuffer.length) {
    for (const s of subs) {
      const lines = [];
      for (const { srcId, item } of rssBuffer) {
        if (!Array.isArray(s.sources) || !s.sources.includes(srcId)) continue;
        if (!kwMatch(item, s.keywords)) continue;
        lines.push(`- [${item.title}](${item.link})`);
      }
      if (!lines.length) continue;
      const md = `## 📰 RSS 汇总（共 ${lines.length} 条）\n${lines.join('\n')}${AD_FOOTER}`;
      const st = await pushMarkdown(s.botUrl, md, 'RSS 每小时汇总');
      if (st >= 200 && st < 300) rssSent += lines.length;
      else rssFailed++;
    }
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

  // 月度聚合度量（仅在有发送时写一次）
  if (digestSent || schedSent || chanSent || rssSent) {
    await bumpMonthly({ digest: digestSent, sched: schedSent, chan: chanSent, rss: rssSent });
  }

  return json({
    ok: true,
    rssSent,
    rssFailed,
    digestSent,
    schedSent,
    chanSent,
    at: now,
  });
}
