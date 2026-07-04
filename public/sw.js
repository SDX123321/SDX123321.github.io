/* sw.js — Service Worker for 期末复习 PWA (v3)
 *
 * v3 改动：
 *   - 删除坏掉的 PRECACHE_URLS（那些是 React 化前的旧文件名，install 阶段 addAll 失败）
 *   - 改为纯运行时缓存：HTML Network-First，静态资源 Stale-While-Revalidate
 *   - 站点本身已是 Vite hash 文件名，天然支持永久缓存
 *   - 跨域请求（KaTeX/MathJax/Giscus/busuanzi/Turnstile CDN）一律不拦截
 */
'use strict';

var VERSION = 'v3';
var HTML_CACHE = 'exam-review-html-' + VERSION;
var ASSET_CACHE = 'exam-review-asset-' + VERSION;

self.addEventListener('install', function (event) {
  // 不预缓存任何东西。跳过 waiting 让新 SW 尽快接管。
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (event) {
  // 清掉所有非当前版本的缓存（包括 v2、v1）
  var keep = [HTML_CACHE, ASSET_CACHE];
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.filter(function (n) { return keep.indexOf(n) === -1; })
             .map(function (n) { return caches.delete(n); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  // 跨域资源交给浏览器默认处理（CDN 自己有缓存）
  if (url.origin !== location.origin) return;

  // HTML：Network-First，离线时回退到缓存
  var isHTML = req.headers.get('accept') || '';
  if (isHTML.indexOf('text/html') !== -1) {
    event.respondWith(networkFirst(req));
    return;
  }

  // 同源静态资源：Stale-While-Revalidate
  if (isStaticAsset(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // 其余同源 GET（如 search_index.json）：Network-First 落缓存
  event.respondWith(networkFirst(req));
});

function isStaticAsset(pathname) {
  var ext = pathname.split('.').pop().toLowerCase();
  return ['js', 'css', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico',
          'woff', 'woff2', 'ttf', 'eot', 'webp', 'avif'].indexOf(ext) !== -1;
}

function staleWhileRevalidate(request) {
  return caches.open(ASSET_CACHE).then(function (cache) {
    return cache.match(request).then(function (cached) {
      var network = fetch(request).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          cache.put(request, res.clone());
        }
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    });
  });
}

function networkFirst(request) {
  return fetch(request).then(function (res) {
    if (res && res.status === 200 && res.type === 'basic') {
      var clone = res.clone();
      caches.open(HTML_CACHE).then(function (cache) { cache.put(request, clone); });
    }
    return res;
  }).catch(function () {
    return caches.match(request).then(function (cached) {
      if (cached) return cached;
      // 对导航请求返回离线兜底页
      if (request.mode === 'navigate') return generateOfflinePage();
      return new Response('离线状态，该内容暂不可用', {
        status: 503,
        headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' }),
      });
    });
  });
}

function generateOfflinePage() {
  return new Response(
    '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1.0">'
    + '<title>离线 - 期末复习</title>'
    + '<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;'
    + 'display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;'
    + 'background:#0c0e1a;color:#e8eaf0;text-align:center;padding:20px}'
    + '.box{max-width:420px}h1{font-size:3rem;margin-bottom:16px}'
    + 'p{color:#9ba1b8;font-size:1rem;line-height:1.7}'
    + 'a{display:inline-block;margin-top:22px;padding:11px 30px;background:#6c8aff;color:#fff;'
    + 'border-radius:10px;text-decoration:none;font-weight:600}</style></head>'
    + '<body><div class="box"><h1>&#128268;</h1>'
    + '<h2 style="margin:0 0 14px">暂无网络连接</h2>'
    + '<p>当前处于离线状态，该页面尚未缓存。<br>已访问过的页面仍可正常浏览。</p>'
    + '<a href="./">返回首页</a></div></body></html>',
    { status: 200, headers: new Headers({ 'Content-Type': 'text/html; charset=utf-8' }) }
  );
}
