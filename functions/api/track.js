import { json, preflight, bumpTrack } from '../_lib.js';

// 零成本埋点接收端：前端用 Image ping / sendBeacon 打点，这里只做每日聚合计数。
// 失败不影响主流程（埋点本身不应阻塞业务）。
export async function onRequestOptions() {
  return preflight();
}

async function record(e) {
  const allowed = ['pv', 'uv', 'widget', 'sub', 'unsub'];
  const ev = allowed.includes(e) ? e : 'pv';
  try {
    await bumpTrack(ev);
  } catch (_) {}
  return json({ ok: true });
}

export async function onRequestGet(request) {
  const e = new URL(request.url).searchParams.get('e') || 'pv';
  return record(e);
}

export async function onRequestPost(request) {
  const b = await request.json().catch(() => ({}));
  return record(b.e || 'pv');
}
