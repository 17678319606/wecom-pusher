import { json, preflight, readList } from '../_lib.js';

export async function onRequestOptions() {
  return preflight();
}

// 公开（虚荣指标，无敏感信息）：连续服务天数、当月聚合、源健康概览
export async function onRequestGet() {
  const streak = await readList('streak', { count: 0, lastDate: '' });
  const m = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 7); // YYYY-MM
  const mstat = await readList('mstat:' + m, { digest: 0, sched: 0, chan: 0, rss: 0, bookmark: 0 });
  const sources = await readList('sources', []);
  const suspect = sources.filter((s) => s.suspect).length;
  return json({
    streak: streak.count || 0,
    lastDate: streak.lastDate || '',
    month: m,
    mstat,
    sources: sources.length,
    suspect,
  });
}
