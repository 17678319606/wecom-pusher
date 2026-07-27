// PWA manifest：移动端（Android Chrome）可「添加到主屏幕」安装，
// 之后用系统分享任意网页 → 选本应用 → 打开 /bookmark?title&content&url 自动预填/推送（移动端一键替代 PC bookmarklet）
const MANIFEST = {
  name: '推送订阅 · 收藏推送',
  short_name: '推送订阅',
  description: '填自己的企微/飞书/钉钉机器人，订阅 RSS 与自定义内容；一键收藏推送给自己。',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#f5f6f8',
  theme_color: '#07c160',
  lang: 'zh-CN',
  share_target: {
    action: '/bookmark',
    method: 'GET',
    params: { title: 'title', text: 'content', url: 'url' },
  },
};

export async function onRequestGet() {
  return new Response(JSON.stringify(MANIFEST), {
    headers: { 'Content-Type': 'application/manifest+json' },
  });
}
