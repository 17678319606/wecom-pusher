import { renderMarkdown, buildWebhookBody } from '../functions/_lib.js';

// 模拟一条真实 RSS 推送：正文里混有「裸 URL」和「<a> 标签」
const sample = {
  title: '测试推送：链接可点击验证',
  content:
    '这是正文，包含裸链 https://example.com/doc 以及 <a href="https://news.example.com/a1">新闻链接</a>，修复后这些链接都能直接点击跳转。',
  url: 'https://example.com/original',
};

const md = renderMarkdown(sample, true); // noAd=true 去掉赞助脚注，方便看纯内容
console.log('==================== 渲染后的 Markdown 正文 ====================');
console.log(md);
console.log('');
console.log('==================== 各平台最终 Webhook 请求体 ====================');
const urls = {
  wecom: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=DEMO',
  feishu: 'https://open.feishu.cn/open-apis/bot/v2/hook/DEMO',
  dingtalk: 'https://oapi.dingtalk.com/robot/send?access_token=DEMO',
};
for (const [plat, u] of Object.entries(urls)) {
  const b = buildWebhookBody(u, md, sample.title);
  console.log(`------- ${plat} (msgtype: ${b.body.msgtype || b.body.msg_type}) -------`);
  console.log(JSON.stringify(b.body, null, 2));
  console.log('');
}
