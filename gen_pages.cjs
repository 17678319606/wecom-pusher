// 把自包含静态页（index.html / index_bookmark.html / 场景落地页）嵌入为 Pages Functions 返回内容。
// 目的：EdgeOne 打包器对非 API 请求走 fetch(request) 同源回抓做静态兜底，在边缘运行时会报 545；
//       改为由函数直接返回 HTML，命中函数即不经过那条回退逻辑。
// 注意：本文件用 CommonJS（.cjs），避免根 package.json 的 "type":"module" 影响 require。
const fs = require('fs');
const path = require('path');

const SITE = 'https://sub.jinbufenzi.com';

// 页面响应头：5 分钟边缘缓存（HTML 外壳静态，广告由前端 /api/ad 动态拉取）+ 安全头
const PAGE_HEAD = `{
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=300, s-maxage=300',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
}`;

const root = __dirname;
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const bm = fs.readFileSync(path.join(root, 'index_bookmark.html'), 'utf8');

const homeJs = `// 由 index.html 生成（gen_pages.cjs）。以函数返回静态首页，规避打包器 fetch(request) 静态回退在边缘运行时报 545 的问题。
const HTML = ${JSON.stringify(home)};

export async function onRequestGet() {
  return new Response(HTML, { headers: ${PAGE_HEAD} });
}
`;
fs.writeFileSync(path.join(root, 'functions', 'index.js'), homeJs);

const bmJs = `// 由 index_bookmark.html 生成（gen_pages.cjs）。收藏推送小工具页（推给自己，无存储）。
const HTML = ${JSON.stringify(bm)};

export async function onRequestGet() {
  return new Response(HTML, { headers: ${PAGE_HEAD} });
}
`;
fs.writeFileSync(path.join(root, 'functions', 'bookmark.js'), bmJs);

// 兼容旧链接 /index_bookmark.html（去掉末尾 .js 后路由即 /index_bookmark.html）
fs.writeFileSync(path.join(root, 'functions', 'index_bookmark.html.js'), bmJs);

// —— SEO 长尾场景落地页（零成本流量引擎）——
// 每个场景是一个独立可收录 URL（/scenario-<slug>），面向高意图长尾查询，CTA 回流到订阅/收藏。
const SCENARIOS = [
  {
    slug: 'github-to-feishu',
    title: '把 GitHub 通知推送到飞书',
    keywords: 'GitHub 通知 飞书, GitHub webhook 飞书, GitHub 推送 飞书 机器人, GitHub PR 提醒 飞书, GitHub CI 失败 通知',
    desc: '用群机器人 Webhook 把 GitHub 的 Issues、Pull Request、Release、CI 结果实时推送到飞书群，零成本、无需自建服务器。',
    body: `<p>很多团队把代码协作放在 GitHub，但消息散落在邮件和各个频道。用「推送订阅」可以把 GitHub 事件通过 <b>飞书群机器人 Webhook</b> 实时汇总到飞书群：</p>
      <ul>
        <li>新 Issue / 评论 → 飞书即时提醒</li>
        <li>Pull Request 被 Review、合并 → 飞书通知</li>
        <li>Release 发布、CI 失败 → 第一时间知道</li>
      </ul>
      <p>只需在飞书群添加一个自定义机器人，复制它的 Webhook，到本站订阅对应内容频道即可。无需服务器、无需付费、无需配置 GitHub Actions。</p>`,
    cta: '/',
  },
  {
    slug: 'rss-to-wecom',
    title: 'RSS 订阅推送到企业微信',
    keywords: 'RSS 订阅 企业微信, RSS 推送 企微, 企业微信 RSS 机器人, 资讯 自动推 企业微信',
    desc: '免费把任意 RSS 资讯源订阅到企业微信群机器人，支持关键词过滤、夜间静默与早报聚合，不错过任何关注的内容。',
    body: `<p>想每天把关注的博客、媒体、行业站点更新自动推到 <b>企业微信</b> 群？用「推送订阅」即可：</p>
      <ul>
        <li>添加任意 RSS 源（如少数派、各官网博客）</li>
        <li>每个订阅者自设关键词，只收想要的内容</li>
        <li>夜间 21:00–06:00 静默不打扰，早 8 点聚合成「早安播报」</li>
      </ul>
      <p>全程只用你自己的企业微信群机器人 Webhook，数据不经过第三方，免费档可长期运行。</p>`,
    cta: '/',
  },
  {
    slug: 'alert-to-dingtalk',
    title: '服务器告警推送到钉钉机器人',
    keywords: '服务器告警 钉钉, 监控告警 推 钉钉, 钉钉 机器人 告警, CI 失败 通知 钉钉',
    desc: '把监控告警、CI 失败、定时任务结果通过钉钉群机器人实时推送，配合关键词与早报，不错过任何异常。',
    body: `<p>运维和开发最怕「出事了却没第一时间知道」。用「推送订阅」把告警接入 <b>钉钉群机器人</b>：</p>
      <ul>
        <li>监控/CI 触发时调用本站接口，转发到钉钉群</li>
        <li>可设自定义内容频道做每日/每周定时汇总</li>
        <li>关键词过滤，只推你关心的级别（如 error/fatal）</li>
      </ul>
      <p>不依赖额外短信/电话通道，用你自己的钉钉机器人即可，零边际成本。</p>`,
    cta: '/',
  },
  {
    slug: 'daily-report-feishu',
    title: '每日早报自动推送到飞书',
    keywords: '每日早报 飞书, 早报 自动推送 飞书, 资讯聚合 飞书, 早安播报 机器人',
    desc: '把订阅的 RSS 与自定义内容在每天早 8 点聚合成「早安播报」自动推送到飞书，夜间更新先缓存不打扰。',
    body: `<p>想每天一睁眼就在 <b>飞书</b> 收到一份资讯简报？「推送订阅」的早报机制天然支持：</p>
      <ul>
        <li>夜间（21:00–06:00）的更新先缓存，不打扰睡眠</li>
        <li>早 8 点自动把缓存内容聚合成「早安播报」推送</li>
        <li>订阅者可按关键词筛选，只收相关条目</li>
      </ul>
      <p>把多个 RSS 源和自定义频道一次性订阅，让飞书成为你的每日早报入口。</p>`,
    cta: '/',
  },
  {
    slug: 'bookmark-to-self',
    title: '网页收藏一键推给自己',
    keywords: '网页收藏 推送, 一键收藏 推到 企微, 稍后阅读 机器人, 第二大脑 收藏',
    desc: '手机手动、PC 书签栏、Android PWA 系统分享——三种方式把任意网页一键推到自己的企微/飞书/钉钉机器人，打造第二大脑。',
    body: `<p>看到好文章想「稍后读」或归档？「收藏推送」让你把任意网页 <b>一键推到自己的机器人</b>：</p>
      <ul>
        <li>手机端：手填机器人 + 标题/链接立即推送</li>
        <li>PC 端：把「收藏小工具」拖到书签栏，任意网页一点即推</li>
        <li>Android：安装为 PWA，系统分享任意网页即收藏</li>
      </ul>
      <p>支持标签分类（如 待读/灵感/值得一试），在机器人里沉淀属于你的第二大脑。</p>`,
    cta: '/bookmark',
  },
];

function scenarioHtml(s) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${s.title}</title>
<meta name="description" content="${s.desc}"/>
<meta name="keywords" content="${s.keywords}"/>
<meta name="robots" content="index,follow"/>
<link rel="canonical" href="${SITE}/scenario-${s.slug}"/>
<style>
  :root { --bg:#f5f6f8; --card:#fff; --pri:#07c160; --txt:#1f2329; --mut:#8a8f99; --bd:#e5e6eb; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif; background:var(--bg); color:var(--txt); }
  .wrap { max-width:560px; margin:0 auto; padding:16px; }
  h1 { font-size:22px; margin:8px 0 8px; }
  .sub { color:var(--mut); font-size:14px; margin-bottom:16px; line-height:1.7; }
  .card { background:var(--card); border:1px solid var(--bd); border-radius:12px; padding:18px; margin-bottom:14px; line-height:1.8; font-size:14px; }
  .card p { margin:0 0 10px; } .card p:last-child { margin-bottom:0; }
  .card ul { margin:6px 0; padding-left:20px; } .card li { margin:4px 0; }
  .topnav { display:flex; gap:8px; margin-bottom:12px; font-size:13px; }
  .topnav a { color:var(--mut); text-decoration:none; padding:6px 12px; border-radius:8px; border:1px solid var(--bd); background:var(--card); }
  .topnav a.active { color:var(--pri); border-color:var(--pri); font-weight:600; }
  .cta { display:block; text-align:center; padding:14px; background:var(--pri); color:#fff; border-radius:10px; font-weight:600; text-decoration:none; margin-top:4px; }
  .foot { max-width:560px; margin:24px auto 18px; padding:0 16px; text-align:center; font-size:12px; color:var(--mut); line-height:1.9; }
  .foot a { color:var(--mut); text-decoration:none; } .foot a:hover { color:var(--pri); } .foot .sep { margin:0 6px; color:#d0d3d9; }
</style>
</head>
<body>
<div class="wrap">
  <div class="topnav"><a href="/">订阅首页</a><a href="/bookmark">收藏推送</a></div>
  <h1>${s.title}</h1>
  <div class="sub">${s.desc}</div>
  <div class="card">${s.body}</div>
  <a class="cta" href="${s.cta}">立即免费使用 →</a>
</div>
<footer class="foot">
  <div><a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener">豫ICP备2024069686号</a><span class="sep">·</span><a href="http://www.beian.gov.cn/portal/registerSystemInfo?recordcode=41132402411815" target="_blank" rel="noopener">豫公网安备41132402411815号</a></div>
  <div style="margin-top:4px"><a href="${SITE}/">推送订阅 · 企微/飞书/钉钉 RSS 与自定义内容推送</a></div>
</footer>
<script>
(function(){ try { var t=new Date(Date.now()+8*3600*1000).toISOString().slice(0,10); var m=document.cookie.match(/(?:^|; )tk_seen=([^;]+)/); if(!m||m[1]!==t){ document.cookie='tk_seen='+t+';path=/;max-age=86400'; var i=new Image(); i.src='/api/track?e=uv&_='+Date.now(); } if(Math.random()<0.1){ var j=new Image(); j.src='/api/track?e=pv&_='+Date.now(); } } catch(e){} })();
</script>
</body>
</html>`;
}

for (const s of SCENARIOS) {
  const html = scenarioHtml(s);
  const js = `// 由 gen_pages.cjs 生成：场景落地页 /scenario-${s.slug}（SEO 长尾）
const HTML = ${JSON.stringify(html)};

export async function onRequestGet() {
  return new Response(HTML, { headers: ${PAGE_HEAD} });
}
`;
  fs.writeFileSync(path.join(root, 'functions', 'scenario-' + s.slug + '.js'), js);
}

console.log('generated functions/index.js, functions/bookmark.js, functions/index_bookmark.html.js');
console.log('home bytes:', home.length, '->', homeJs.length);
console.log('bookmark bytes:', bm.length, '->', bmJs.length);
console.log('scenarios:', SCENARIOS.map((s) => s.slug).join(', '));
