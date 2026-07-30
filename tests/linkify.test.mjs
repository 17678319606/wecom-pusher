import { linkify, renderMarkdown, buildWebhookBody } from '../functions/_lib.js';

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

console.log('\nrenderMarkdown:');
const rm = renderMarkdown({ title: 'T', content: '正文含裸链 https://blog.test/p 和 <a href="https://in.test">内链</a>', url: 'https://t.cn/orig' });
ok('正文链接被激活（含 [https://blog.test/p]）', rm.includes('[https://blog.test/p](https://blog.test/p)'), rm);
ok('正文 <a> 转标准链接', rm.includes('[内链](https://in.test)'), rm);
ok('底部查看原文存在', rm.includes('[查看原文](https://t.cn/orig)'), rm);

console.log('\nbuildWebhookBody — 三平台统一 markdown + [text](url):');
const wecomUrl = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc';
const feishuUrl = 'https://open.feishu.cn/open-apis/bot/v2/hook/abc';
const dingUrl = 'https://oapi.dingtalk.com/robot/send?access_token=abc';
const testMd = '[看原文](https://t.cn/x)\n[赞助广告](https://jinbufenzi.com/go/5i7736)';

// 企微：现在也走 markdown（和飞书/钉钉统一）
const w = buildWebhookBody(wecomUrl, testMd, 'T');
ok('企微用 markdown 类型（三平台统一）', w.body.msgtype === 'markdown' && !!w.body.markdown, JSON.stringify(w.body));
ok('企微 content 含 [text](url)', w.body.markdown.content.includes('[看原文](https://t.cn/x)'), w.body.markdown.content);
ok('企微无 text 类型残留', !w.body.text, JSON.stringify(w.body));
ok('企微无 <a> 标签', !w.body.markdown.content.includes('<a '), w.body.markdown.content);

// 飞书
const fl = buildWebhookBody(feishuUrl, testMd, 'T');
ok('飞书用 markdown + [text](url)', fl.body.markdown.content.includes('[看原文](https://t.cn/x)'), fl.body.markdown.content);

// 钉钉
const dt = buildWebhookBody(dingUrl, testMd, 'T');
ok('钉钉用 markdown + [text](url)', dt.body.markdown.text.includes('[看原文](https://t.cn/x)'), dt.body.markdown.text);

// 完整消息模拟
const fullMd = renderMarkdown({ title: '周末酒店', content: '节假日出行100元住酒店', url: 'https://jinbufenzi.com/go/fa1592' });
const wFull = buildWebhookBody(wecomUrl, fullMd, '周末酒店');
ok('完整消息：企微 markdown 含标题 ##', wFull.body.markdown.content.includes('## 周末酒店'), wFull.body.markdown.content);
ok('完整消息：企微含 [查看原文]', wFull.body.markdown.content.includes('[查看原文]('), wFull.body.markdown.content);
ok('完整消息：企微含 [赞助广告]', wFull.body.markdown.content.includes('[赞助广告]('), wFull.body.markdown.content);

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
