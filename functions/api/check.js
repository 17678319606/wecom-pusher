import { json, preflight, WEBHOOK_RE, detectPlatform, pushMarkdown, rateLimited, clientIp } from '../_lib.js';

export async function onRequestOptions() {
  return preflight();
}

// Webhook 即时自检：订阅前先发一条测试消息，验证机器人地址有效、能收到推送。
// 降低"填错/失效 Webhook 导致订阅后收不到任何推送"的失败率。
export async function onRequestPost(context) {
  const { request } = context;
  if (await rateLimited(clientIp(request), 'check', 20)) {
    return json({ error: '操作过于频繁，请稍后再试' }, 429);
  }
  const body = await request.json().catch(() => ({}));
  const botUrl = (body.url || '').trim();
  if (!WEBHOOK_RE.test(botUrl)) {
    return json({ ok: false, error: '请填写合法的机器人 Webhook（支持企业微信 / 飞书 / 钉钉）' }, 400);
  }
  // 测试消息与真实推送同构（含赞助脚注），让用户看到真实效果、避免 surprises
  const testMd =
    '## ✅ Webhook 自检成功\n> 这是一条来自「推送订阅」的测试消息，说明你的机器人配置正确。\n\n现在就去首页订阅你喜欢的 RSS 源吧！';
  const status = await pushMarkdown(botUrl, testMd, 'Webhook 自检');
  const platform = detectPlatform(botUrl);
  if (status >= 200 && status < 300) {
    return json({ ok: true, platform, status });
  }
  return json(
    {
      ok: false,
      platform,
      status,
      error: status === 0 ? '网络不可达或地址无效' : '机器人返回错误，请检查 Webhook 是否有效',
    },
    502
  );
}
