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

// 由 edgeone.json 的 schedules 每 5 分钟触发一次
// 负责：
//   1) RSS 轮询推送（夜间 21:00-06:00 静默，缓存为早报；其余时段即时推送；订阅者关键词过滤）
//   2) 定时群发（给所有人，不受静默影响）
//   3) 自定义内容频道定时推送（不受静默影响）
//   附加：连续服务天数 / 月度聚合度量；RSS 源失效自愈 + 早报静默告警
export async function onRequestPost() {
  const now = Date.now();
  const h = shHour(now);
  const silent = inSilent(h);
  const morning = digestDue(h);

  // 连续服务天数：cron 每次跑即视为"服务在线"一天（断更归 1）
  await bumpStreak();

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
      const items = parseRSS(xml).slice(0, 5);
      if (!items.length) {
        recover(src, now); // 可达但空，不算失败
        continue;
      }
      const top = items[0];
      const topHash = top.title + '|' + top.link;
      if (topHash === src.lastHash) {
        recover(src, now); // 无新内容，可达正常
        continue;
      }

      const newItem = {
        title: top.title,
        link: top.link,
        description: stripTags(top.description),
      };
      src.lastHash = topHash;
      recover(src, now); // 抓取成功 → 解除疑似失效

      // 静默窗口：只缓存，不推送
      if (silent) {
        const buf = await readList('digest:' + src.id, []);
        buf.push(newItem);
        await writeList('digest:' + src.id, buf);
        continue;
      }

      // 日间：即时推送（订阅者关键词过滤；疑似失效源不推送）
      if (src.suspect) continue;
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
      markFail(src, now);
    }
  }
  await writeList('sources', sources);

  // 1b) 早报：早 8 点把夜间缓存的 RSS 更新聚合推送（疑似失效源不参与）
  if (morning) {
    for (const src of sources) {
      if (src.suspect) continue; // 疑似失效源跳过，避免推陈旧内容
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

    // 失效静默告警：当天仅提醒一次，避免刷屏
    const suspectNow = sources.filter((s) => s.suspect).map((s) => s.name);
    if (suspectNow.length) {
      const alertKey = 'alerted:' + shDate(now);
      const already = await KV.get(alertKey);
      if (!already) {
        const md =
          `## ⚠️ 推送源健康提醒\n` +
          `有 ${suspectNow.length} 个 RSS 源连续抓取失败（已暂停推送，避免打扰）：\n` +
          suspectNow.map((n) => `- 《${n}》`).join('\n') +
          `\n请到后台检查这些源的地址是否失效，恢复后自动解除暂停。${AD_FOOTER}`;
        for (const s of subs) {
          await pushMarkdown(s.botUrl, md, '源健康提醒');
        }
        await KV.put(alertKey, '1');
      }
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
    silent,
    rssSent,
    rssFailed,
    digestSent,
    schedSent,
    chanSent,
    at: now,
  });
}
