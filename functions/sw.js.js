// 最小 Service Worker：仅用于让站点可被「安装到主屏幕」（PWA 可安装性要求），
// 分享目标由 manifest 的 share_target 直接打开 /bookmark 处理，无需拦截 fetch。
export async function onRequestGet() {
  const body = `self.addEventListener('install', function(e){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });
`;
  return new Response(body, {
    headers: { 'Content-Type': 'application/javascript' },
  });
}
