import { linkify, renderMarkdown, buildWebhookBody, detectPlatform } from '../functions/_lib.js';

let pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, '\n      got:', JSON.stringify(got)); }
}

console.log('linkify:');
const a = linkify('详见 https://example.com/a 了解');
ok('裸 URL 被包裹', a.includes('[https://example.com/a](https://example.com/a)'), a);

const b = linkify('<a href="https://x.com">点这里</a>');
ok('<a> 转标准链接', b === '[点这里](https://x.com)', b);

const c = linkify('<p>看 <a href="https://y.com">Y</a> 和 <b>粗</b> https://z.com</p>');
ok('混合标签：保留链接+剥其他标签+裸URL链接化',
   c.includes('[Y](https://y.com)') && c.includes('[https://z.com](https://z.com)') && !c.includes('<b>'), c);

const d = linkify('[已有](https://a.com) 文字');
ok('已有 [text](url) 不重复包裹', d === '[已有](https://a.com) 文字', d);

const e = linkify('访问 www.example.com 吧');
ok('裸 www. 包裹并补 http://', e.includes('[www.example.com](http://www.example.com)'), e);

const f = linkify('实体 &amp; 测试 <a href="https://q.com">Q</a>');
ok('HTML 实体还原 + 链接保留', f.includes('&') && f.includes('[Q](https://q.com)'), f);

console.log('renderMarkdown:');
const rm = renderMarkdown({ title: 'T', content: '正文含裸链 https://blog.test/p 和 <a href="https://in.test">内链</a>', url: 'https://t.cn/orig' });
ok('正文链接被激活（含 [https://blog.test/p]）', rm.includes('[https://blog.test/p](https://blog.test/p)'), rm);
ok('正文 <a> 转标准链接', rm.includes('[内链](https://in.test)'), rm);
ok('底部查看原文存在', rm.includes('[查看原文](https://t.cn/orig)'), rm);

console.log('buildWebhookBody 平台差异:');
const wecomUrl = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc';
const feishuUrl = 'https://open.feishu.cn/open-apis/bot/v2/hook/abc';
const dingUrl = 'https://oapi.dingtalk.com/robot/send?access_token=abc';

const w = buildWebhookBody(wecomUrl, '[看原文](https://t.cn/x) 和裸 https://t.cn/y', 'T');
ok('企微转 <a href>', w.platform === 'wecom' && w.body.markdown.content.includes('<a href="https://t.cn/x">看原文</a>'), w.body.markdown.content);
ok('企微裸链也转 <a>', w.body.markdown.content.includes('<a href="https://t.cn/y">https://t.cn/y</a>'), w.body.markdown.content);

const fl = buildWebhookBody(feishuUrl, '[看原文](https://t.cn/x)', 'T');
ok('飞书保留 [text](url)', fl.platform === 'feishu' && fl.body.markdown.content.includes('[看原文](https://t.cn/x)') && !fl.body.markdown.content.includes('<a '), fl.body.markdown.content);

const dt = buildWebhookBody(dingUrl, '[看原文](https://t.cn/x)', 'T');
ok('钉钉保留 [text](url) 且用 text 字段', dt.platform === 'dingtalk' && dt.body.markdown.text.includes('[看原文](https://t.cn/x)'), dt.body.markdown.text);

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
