// 把自包含静态页（index.html / index_bookmark.html）嵌入为 Pages Functions 返回内容。
// 目的：EdgeOne 打包器对非 API 请求走 fetch(request) 同源回抓做静态兜底，在边缘运行时会报 545；
//       改为由函数直接返回 HTML，命中函数即不经过那条回退逻辑。
const fs = require('fs');
const path = require('path');

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

const homeJs = `// 由 index.html 生成（gen_pages.js）。以函数返回静态首页，规避打包器 fetch(request) 静态回退在边缘运行时报 545 的问题。
const HTML = ${JSON.stringify(home)};

export async function onRequestGet() {
  return new Response(HTML, { headers: ${PAGE_HEAD} });
}
`;
fs.writeFileSync(path.join(root, 'functions', 'index.js'), homeJs);

const bmJs = `// 由 index_bookmark.html 生成（gen_pages.js）。收藏推送小工具页（推给自己，无存储）。
const HTML = ${JSON.stringify(bm)};

export async function onRequestGet() {
  return new Response(HTML, { headers: ${PAGE_HEAD} });
}
`;
fs.writeFileSync(path.join(root, 'functions', 'bookmark.js'), bmJs);

// 兼容旧链接 /index_bookmark.html（去掉末尾 .js 后路由即 /index_bookmark.html）
fs.writeFileSync(path.join(root, 'functions', 'index_bookmark.html.js'), bmJs);

console.log('generated functions/index.js, functions/bookmark.js, functions/index_bookmark.html.js');
console.log('home bytes:', home.length, '->', homeJs.length);
console.log('bookmark bytes:', bm.length, '->', bmJs.length);
