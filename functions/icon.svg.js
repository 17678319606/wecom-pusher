// PWA 图标：manifest icons 指向这里，使「添加到主屏幕」安装横幅能正常出现。
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#07c160"/>
  <text x="50%" y="54%" font-size="300" text-anchor="middle" dominant-baseline="middle"
        fill="#ffffff" font-family="-apple-system,Segoe UI,Roboto,sans-serif" font-weight="700">推</text>
</svg>`;

export async function onRequestGet() {
  return new Response(SVG, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
