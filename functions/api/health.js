import { json, preflight, readList } from '../_lib.js';

// 健康检查：不仅看函数是否在线，更关键的是看"定时任务(cron)是否真的在按时触发"。
// 之前 /api/health 无对应函数 → 返回 545，导致"不推送"问题长期无感知。
// 现在通过 lastTick 时间戳判断 cron 是否在最近窗口内跑过，把沉默故障变成可见信号。
export async function onRequestOptions() {
  return preflight();
}

export async function onRequestGet() {
  const streak = await readList('streak', { count: 0, lastDate: '' });
  const lastTickRaw = await KV.get('lastTick');
  const now = Date.now();
  const last = lastTickRaw ? Number(lastTickRaw) : 0;
  const staleMs = now - last;
  // 周期为每小时，超过 75 分钟（1.25 个周期 + 余量）未触发即判定 cron 失效
  const cronAlive = last > 0 && staleMs < 75 * 60 * 1000;
  return json({
    ok: true,
    cronAlive,
    lastTick: last ? new Date(last).toISOString() : null,
    staleMinutes: last ? Math.round(staleMs / 60000) : null,
    streak: streak.count || 0,
    lastDate: streak.lastDate || '',
    now: new Date(now).toISOString(),
    note: cronAlive
      ? '定时任务正常：cron 在按时触发 /api/cron/tick。'
      : '定时任务未触发或已失效。EdgeOne Makers(direct-upload) 不会自动应用 edgeone.json 的 schedules，请二选一：(1) 控制台「项目 → 定时任务」手动建 /api/cron/tick (cron=0 * * * *, POST, Asia/Shanghai)；(2) 用 cron-job.org 等外部服务每小时 POST 一次该地址（端点幂等、哈希去重）。',
  });
}
