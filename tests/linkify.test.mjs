import { renderMarkdown, buildWebhookBody, detectPlatform } from '../functions/_lib.js';

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} → ${detail ?? 'cond falsy'}`); }
}

console.log('=== toPlainText 排版测试（企微 text 类型） ===\n');

// 模拟企微的 toPlainText 输出（通过 buildWebhookBody 间接获取）
function wecomText(md) {
  const r = buildWebhookBody('https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test', md);
  return r.body.text.content;
}

// 1. [text](url) 应换行分离
const t1 = wecomText('[查看原文](https://t.cn/x)');
ok('[text](url) → 文字换行URL', t1 === '查看原文\nhttps://t.cn/x', t1);

// 2. 完整 RSS 消息模拟
const rssMd = renderMarkdown({
  title: '今日热点：AI 大模型最新进展',
  content: '据媒体报道，OpenAI 发布了新模型 GPT-5，性能大幅提升。详见 <a href="https://example.com/gpt5">官方公告</a>。',
  url: 'https://news.example.com/ai-gpt5',
});
const rssText = wecomText(rssMd);
console.log('  --- RSS 消息企微输出 ---');
console.log(rssText);
console.log('  ---');
ok('标题无 # 号', !rssText.includes('#'), rssText);
ok('引用符 > 已剥离', !rssText.includes('>'), rssText);
ok('[查看原文] 换行分离', rssText.includes('查看原文\nhttps://news.example.com/ai-gpt5'), rssText);
ok('[官方公告] 换行分离', rssText.includes('官方公告\nhttps://example.com/gpt5'), rssText);
ok('无多余空行（最多一个）', !rssText.includes('\n\n\n'), rssText);

// 3. 裸 URL 保留在原位
const t3 = wecomText('访问 https://t.cn/y 了解更多');
ok('裸 URL 保留在文本中', t3.includes('https://t.cn/y'), t3);

// 4. 多链接分行
const multi = wecomText('推荐阅读 [文章A](https://a.com) 和 [文章B](https://b.com)');
ok('多链接各自换行', multi.includes('文章A\nhttps://a.com') && multi.includes('文章B\nhttps://b.com'), multi);

// 5. 赞助广告也换行
const adText = wecomText('正文内容\n\n[赞助广告](https://jinbufenzi.com/go/5i7736)');
ok('赞助广告换行分离', adText.includes('赞助广告\nhttps://jinbufenzi.com/go/5i7736'), adText);

// 6. 飞书/钉钉不受影响（仍为 markdown）
const feishuR = buildWebhookBody('https://open.feishu.cn/open-apis/bot/v2/hook/test', 'test [link](https://t.cn)');
ok('飞书仍用 markdown 类型', feishuR.body.msg_type === 'markdown', JSON.stringify(feishuR.body));
ok('飞书保留 [text](url)', feishuR.body.markdown.content.includes('[link](https://t.cn)'), feishuR.body.markdown.content);

const dingR = buildWebhookBody('https://oapi.dingtalk.com/robot/send?access_token=test', 'test [link](https://t.cn)');
ok('钉钉仍用 markdown 类型', dingR.body.msgtype === 'markdown', JSON.stringify(dingR.body));
ok('钉钉保留 [text](url)', dingR.body.markdown.text.includes('[link](https://t.cn)'), dingR.body.markdown.text);

console.log(`\n=== 结果：${pass}/${pass + fail} 通过 ===`);
if (fail > 0) process.exit(1);
