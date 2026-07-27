// robots.txt：允许全站收录，指向 sitemap
const SITE = 'https://sub.jinbufenzi.com';

export async function onRequestGet() {
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`;
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
