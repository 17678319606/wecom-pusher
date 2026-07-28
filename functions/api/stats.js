import { json, preflight, readList, shDate } from '../_lib.js';

const TRACK_FALLBACK = { pv: 0, uv: 0, widget: 0, sub: 0, unsub: 0 };

// 近 N 日埋点漏斗聚合（并行读 KV，写频可控）。返回 {pv,uv,widget,sub,unsub} 累加值。
async function sumTrack(days) {
  const keys = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() + 8 * 3600 * 1000 - i * 86400000).toISOString().slice(0, 10);
    keys.push('track:' + d);
  }
  const vals = await Promise.all(keys.map((k) => readList(k, TRACK_FALLBACK)));
  const agg = { ...TRACK_FALLBACK };
  for (const t of vals) {
    agg.pv += t.pv || 0;
    agg.uv += t.uv || 0;
    agg.widget += t.widget || 0;
    agg.sub += t.sub || 0;
    agg.unsub += t.unsub || 0;
  }
  return agg;
}

export async function onRequestOptions() {
  return preflight();
}

// 公开（虚荣指标，无敏感信息）：连续服务天数、当月聚合、源健康概览、埋点转化漏斗、订阅规模、投递质量
export async function onRequestGet() {
  const today = shDate(Date.now());
  const streak = await readList('streak', { count: 0, lastDate: '' });
  const m = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 7); // YYYY-MM
  const mstat = await readList('mstat:' + m, { digest: 0, sched: 0, chan: 0, rss: 0, bookmark: 0 });
  const sources = await readList('sources', []);
  const suspect = sources.filter((s) => s.suspect).length;
  const subscribers = await readList('subscribers', []);
  const pushes = await readList('pushes', []);
  const channels = await readList('channels', []);
  // 聚合投递成功率（各源/群发/频道单体 ok/fail 累加；旧条目可能无 stats，用 ?. 兜底）
  let dOk = 0;
  let dFail = 0;
  for (const x of [...sources, ...pushes, ...channels]) {
    dOk += (x.stats && x.stats.ok) || 0;
    dFail += (x.stats && x.stats.fail) || 0;
  }
  const delivery = {
    ok: dOk,
    fail: dFail,
    rate: dOk + dFail ? Number((dOk / (dOk + dFail)).toFixed(4)) : null,
  };
  // P1-A：接入 track 埋点漏斗（消头号盲区）—— 当日明细 + 近30日聚合
  const trackToday = await readList('track:' + today, TRACK_FALLBACK);
  const track30 = await sumTrack(30);
  return json({
    streak: streak.count || 0,
    lastDate: streak.lastDate || '',
    month: m,
    mstat,
    sources: sources.length,
    suspect,
    subscribers: subscribers.length,
    delivery,
    trackToday,
    track30,
  });
}
