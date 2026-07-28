// 纯单元测试：不依赖 EdgeOne 运行时，仅需一个内存版 KV 全局桩。
// 运行：npm test  (即 node --test tests/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

// —— KV 内存桩（在导入 _lib 之前注入全局）——
class MockKV {
  constructor() { this.m = new Map(); }
  async get(k) { return this.m.has(k) ? this.m.get(k) : null; }
  async put(k, v) { this.m.set(k, v); }
  async delete(k) { this.m.delete(k); }
}
globalThis.KV = new MockKV();

// 动态导入（保证 KV 桩已就位）
const lib = await import('../functions/_lib.js');

// —— 纯函数 ——
test('simpleHash: 稳定且为十六进制', () => {
  const h = lib.simpleHash('abc');
  assert.match(h, /^[0-9a-f]+$/);
  assert.equal(lib.simpleHash('abc'), lib.simpleHash('abc'));
  assert.notEqual(lib.simpleHash('abc'), lib.simpleHash('abd'));
});

test('stripTags: 去标签/实体并压缩空格', () => {
  assert.equal(lib.stripTags('<p>Hello <b>world</b></p>'), 'Hello world');
  assert.equal(lib.stripTags('  多  余  空格  '), '多 余 空格');
  assert.equal(lib.stripTags('a'.repeat(900)).length, 800);
});

test('detectPlatform: 三平台识别 + unknown', () => {
  assert.equal(lib.detectPlatform('https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=x'), 'wecom');
  assert.equal(lib.detectPlatform('https://open.feishu.cn/open-apis/bot/v2/hook/x'), 'feishu');
  assert.equal(lib.detectPlatform('https://oapi.dingtalk.com/robot/send?access_token=x'), 'dingtalk');
  assert.equal(lib.detectPlatform('https://example.com/x'), 'unknown');
});

test('renderMarkdown: 含标题/正文/链接，noAd 时去掉赞助脚注', () => {
  const md = lib.renderMarkdown({ title: 'T', content: 'C', url: 'https://u' }, false);
  assert.ok(md.includes('## T'));
  assert.ok(md.includes('C'));
  assert.ok(md.includes('https://u'));
  assert.ok(md.includes(lib.AD_FOOTER));
  const md2 = lib.renderMarkdown({ title: 'T', content: 'C' }, true);
  assert.ok(!md2.includes(lib.AD_FOOTER));
});

test('maskBot: 脱敏机器人 key 尾部', () => {
  const u = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abcdefghijklmnop';
  const masked = lib.maskBot(u);
  assert.ok(masked.includes('...mnop'));
  assert.ok(!masked.includes('abcdefghijklmnop'));
});

test('parseRSS: 解析条目并过滤无 title/link 的项', () => {
  const xml = `<rss><channel>
    <item><title>Hello</title><link>https://a.com/1</link><description>desc</description></item>
    <item><title>World</title><link>https://a.com/2</link></item>
    <item><title>NoLink</title></item>
  </channel></rss>`;
  const items = lib.parseRSS(xml);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'Hello');
  assert.equal(items[0].link, 'https://a.com/1');
  assert.equal(items[0].description, 'desc');
});

test('kwMatch: 空词全过；命中/不命中/大小写不敏感', () => {
  assert.equal(lib.kwMatch({ title: 'x', description: 'y' }, []), true);
  assert.equal(lib.kwMatch({ title: 'AI 日报', description: '' }, ['ai']), true);
  assert.equal(lib.kwMatch({ title: '体育新闻', description: '' }, ['ai']), false);
});

test('shDate: 返回 YYYY-MM-DD', () => {
  assert.match(lib.shDate(Date.now()), /^\d{4}-\d{2}-\d{2}$/);
});

test('lastOccurrence(daily): 计算今天 09:00 或回退到昨天', () => {
  const now = Date.now();
  const occ = lib.lastOccurrence({ schedule: { type: 'daily', hour: 9, minute: 0 } }, now);
  const off = 8 * 3600 * 1000;
  const sh = new Date(now + off);
  const base = Date.UTC(sh.getUTCFullYear(), sh.getUTCMonth(), sh.getUTCDate(), 9, 0) - off;
  const expected = base <= now ? base : base - 86400000;
  assert.equal(occ, expected);
});

// —— KV 相关（内存桩）——
test('readList/writeList: 往返一致；缺省值生效', async () => {
  await lib.writeList('test:key', [1, 2, 3]);
  assert.deepEqual(await lib.readList('test:key'), [1, 2, 3]);
  assert.deepEqual(await lib.readList('missing', 'def'), 'def');
});

test('bumpStreak: 当日不重复计数；连续/断更逻辑正确', async () => {
  // 清空
  await globalThis.KV.put('streak', JSON.stringify({ count: 0, lastDate: '' }));
  const a = await lib.bumpStreak();
  const b = await lib.bumpStreak(); // 同日
  assert.equal(b.count, 1);
  // 模拟「昨天已记 5 天」
  const y = new Date(Date.now() + 8 * 3600 * 1000 - 86400000).toISOString().slice(0, 10);
  await globalThis.KV.put('streak', JSON.stringify({ count: 5, lastDate: y }));
  const c = await lib.bumpStreak();
  assert.equal(c.count, 6);
  // 模拟「很久以前」
  await globalThis.KV.put('streak', JSON.stringify({ count: 9, lastDate: '2000-01-01' }));
  const d = await lib.bumpStreak();
  assert.equal(d.count, 1);
  void a;
});

test('bumpMonthly: 同月累加 deltas', async () => {
  const m = lib.shDate(Date.now()).slice(0, 7);
  await lib.bumpMonthly({ digest: 1, sched: 2 });
  let cur = JSON.parse(await globalThis.KV.get('mstat:' + m));
  assert.equal(cur.digest, 1);
  assert.equal(cur.sched, 2);
  await lib.bumpMonthly({ digest: 1 });
  cur = JSON.parse(await globalThis.KV.get('mstat:' + m));
  assert.equal(cur.digest, 2);
  assert.equal(cur.sched, 2);
});

test('bumpTrack: 按事件累加；未知事件被忽略不报错', async () => {
  const d = lib.shDate(Date.now());
  await lib.bumpTrack('sub');
  await lib.bumpTrack('sub');
  let cur = JSON.parse(await globalThis.KV.get('track:' + d));
  assert.equal(cur.sub, 2);
  await lib.bumpTrack('weird'); // 不应写入 weird 键
  cur = JSON.parse(await globalThis.KV.get('track:' + d));
  assert.equal(cur.weird, undefined);
});

test('rateLimited: 达到上限后限流；不同 key 独立', async () => {
  const ip = '1.2.3.4';
  for (let i = 0; i < 30; i++) {
    assert.equal(await lib.rateLimited(ip, 'sub', 30), false);
  }
  assert.equal(await lib.rateLimited(ip, 'sub', 30), true);
  assert.equal(await lib.rateLimited(ip, 'other', 30), false);
});

// —— 导入冒烟：所有 functions 文件都能加载且导出 onRequest* 处理器 ——
function collectJs(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectJs(p, acc);
    else if (e.name.endsWith('.js') && !e.name.endsWith('_lib.js')) acc.push(p);
  }
  return acc;
}

test('import smoke: 每个 function 文件都导出 onRequest* 处理器', async () => {
  const funcRoot = fileURLToPath(new URL('../functions', import.meta.url));
  const files = collectJs(funcRoot);
  assert.ok(files.length > 0, '未找到任何 function 文件');
  for (const f of files) {
    const mod = await import(pathToFileURL(f).href);
    const has = Object.keys(mod).some((k) => k.startsWith('onRequest'));
    assert.ok(has, '缺少 onRequest* 导出: ' + f);
  }
});
