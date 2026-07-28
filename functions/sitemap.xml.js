// sitemap.xml：列出可收录页面（带 lastmod 新鲜度信号）
const SITE = 'https://sub.jinbufenzi.com';
const today = new Date().toISOString().slice(0, 10);
// 与 gen_pages.cjs 的 SCENARIOS 保持一致（独立维护，避免跨文件依赖）
const SCENARIO_SLUGS = ['github-to-feishu', 'rss-to-wecom', 'alert-to-dingtalk', 'daily-report-feishu', 'bookmark-to-self'];

function urlEntry(loc, changefreq, priority) {
  return `  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

export async function onRequestGet() {
  const urls = [
    urlEntry(`${SITE}/`, 'weekly', '1.0'),
    urlEntry(`${SITE}/bookmark`, 'monthly', '0.8'),
    ...SCENARIO_SLUGS.map((s) => urlEntry(`${SITE}/scenario-${s}`, 'monthly', '0.7')),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;
  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
