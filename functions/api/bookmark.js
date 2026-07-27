import {
  json,
  preflight,
  pushToBot,
  rateLimited,
  clientIp,
} from '../_lib.js';

// 支持 企业微信 / 飞书 / 钉钉 机器人
const WEBHOOK_RE = /^https:\/\/(qyapi\.weixin\.qq\.com\/cgi-bin\/webhook\/send\?key=|open\.feishu\.(cn|com)\/open-apis\/bot\/v2\/hook\/|oapi\.dingtalk\.com\/robot\/send\?access_token=)/i;

export async function onRequestOptions() {
  return preflight();
}

// 收藏推送：任何人填自己的机器人链接 + 标题/链接，立即推给自己。不存储任何数据。
export async function onRequestPost(context) {
  const { request } = context;
  // 防刷：每 IP 每小时最多 50 次
  if (await rateLimited(clientIp(request), 'bm', 50)) {
    return json({ error: '操作过于频繁，请稍后再试' }, 429);
  }
  const body = await request.json().catch(() => ({}));
  const botUrl = (body.botUrl || '').trim();
  const title = (body.title || '').trim();
  if (!WEBHOOK_RE.test(botUrl)) {
    return json({ error: '请填写合法的机器人 Webhook（支持企业微信 / 飞书 / 钉钉）' }, 400);
  }
  if (!title) {
    return json({ error: '标题不能为空' }, 400);
  }
  const st = await pushToBot(
    botUrl,
    {
      title,
      content: (body.content || '').trim(),
      url: (body.url || '').trim(),
    },
    2,
    true // 个人收藏工具不加赞助广告
  );
  if (st >= 200 && st < 300) {
    return json({ ok: true });
  }
  return json({ error: '推送失败，请检查机器人链接是否有效', code: st }, 502);
}
